import { z } from "zod"

import { boxFromModelPixels } from "@/lib/redaction"
import type { RedactionBox } from "@/lib/redaction"

import { ServiceError } from "./errors"

export const ADJUSTMENT_TYPES = [
  "discount",
  "delivery",
  "service",
  "tax",
  "other",
] as const

const safeInt = z
  .number()
  .int()
  .refine((n) => Number.isSafeInteger(n), "outside the safe integer range")
const missingText = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? "")
const missingInt = safeInt.nullish().transform((value) => value ?? 0)

const ocrItemSchema = z.object({
  name: missingText,
  variantNotes: missingText,
  quantity: missingInt.pipe(safeInt.min(0)),
  unitPrice: missingInt.pipe(safeInt.min(0)),
})

const ocrAdjustmentSchema = z.object({
  type: z
    .enum(ADJUSTMENT_TYPES)
    .nullish()
    .transform((type) => type ?? ("other" as const)),
  label: missingText,
  amount: missingInt,
})

export const receiptOcrSchema = z.object({
  merchant: missingText,
  orderDate: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .nullish()
    .transform((date) => date ?? ""),
  items: z.array(ocrItemSchema).min(1),
  adjustments: z
    .array(ocrAdjustmentSchema)
    .nullish()
    .transform((rows) => rows ?? []),
  sourceSubtotal: missingInt.pipe(safeInt.min(0)),
  finalTotal: missingInt,
})

export type ReceiptOcr = z.infer<typeof receiptOcrSchema>

export interface OcrEnvConfig {
  VISION_API_URL?: string
  VISION_API_TOKEN?: string
  VISION_API_PROVIDER?: string
  VISION_API_MODEL?: string
  VISION_API_REASONING_EFFORT?: string
  CF_ACCESS_CLIENT_ID?: string
  CF_ACCESS_CLIENT_SECRET?: string
}

const modelRedactionSchema = z.object({
  label: z.string().trim().catch(""),
  box: z.array(z.number()).length(4),
})

export function readRedactions(
  raw: unknown,
  imageWidth: number,
  imageHeight: number
): RedactionBox[] {
  if (!Array.isArray(raw) || imageWidth <= 0 || imageHeight <= 0) return []
  const boxes: RedactionBox[] = []
  for (const entry of raw) {
    const parsed = modelRedactionSchema.safeParse(entry)
    if (!parsed.success) continue
    const box = boxFromModelPixels(
      parsed.data.box,
      imageWidth,
      imageHeight,
      parsed.data.label || undefined
    )
    if (box) boxes.push(box)
  }
  return boxes
}

function buildOcrPrompt(width: number, height: number): string {
  const dims =
    width > 0 && height > 0
      ? `in pixel coordinates of this ${width}x${height} image`
      : "in pixel coordinates of the image"
  return [
    "This is a food-order receipt. Extract its contents and reply with a JSON object of this exact shape:",
    '{"merchant": string, "orderDate": string, "items": [{"name": string, "variantNotes": string, "quantity": int, "unitPrice": int}], "adjustments": [{"type": "discount"|"delivery"|"service"|"tax"|"other", "label": string, "amount": int}], "sourceSubtotal": int, "finalTotal": int, "redactions": [{"label": string, "box": [x0, y0, x1, y1]}]}',
    "Rules: unitPrice is per single unit when the line shows a multiplier like '3 x Cold Tonic'.",
    "For missing or unreadable numbers use 0. For missing text use an empty string. Do not guess values; the user can enter them in the form.",
    'For an unreadable adjustment type use "other". Omit adjustments that are not visible.',
    "Rupiah values are plain integers (Rp26.000 -> 26000).",
    'variantNotes is the grey option text under an item, "" if none.',
    "adjustment amounts keep the sign as printed (a voucher discount is negative).",
    'orderDate is YYYY-MM-DD if the receipt shows one, otherwise "".',
    'merchant is the restaurant or store name, "" if not shown.',
    "sourceSubtotal is the menu subtotal before adjustments; finalTotal is the amount actually charged.",
    "redactions lists personal or identifying values visible on the image: order or transaction numbers, booking IDs, customer names, driver names, phone numbers, the customer's delivery address, email addresses, vehicle plates, and card or account numbers.",
    "Do not list the merchant name, the store's own address, menu items, prices, or dates.",
    `Each box tightly covers the value text only, not its label, ${dims}: x0,y0 is the top-left corner and x1,y1 the bottom-right.`,
    'label names what the box hides, like "order number". Use [] when nothing personal is visible.',
  ].join("\n")
}

function resolveOcrConfig(envConfig: OcrEnvConfig) {
  const baseUrl = envConfig.VISION_API_URL?.trim().replace(/\/+$/, "")
  const token = envConfig.VISION_API_TOKEN?.trim()
  if (!baseUrl || !token) {
    throw new ServiceError(
      503,
      "OCR_NOT_CONFIGURED",
      "Receipt OCR is not configured yet. Set VISION_API_URL and VISION_API_TOKEN on the Worker.",
      { configured: false }
    )
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  const cfId = envConfig.CF_ACCESS_CLIENT_ID?.trim()
  const cfSecret = envConfig.CF_ACCESS_CLIENT_SECRET?.trim()
  if (cfId && cfSecret) {
    headers["CF-Access-Client-Id"] = cfId
    headers["CF-Access-Client-Secret"] = cfSecret
  }

  return {
    baseUrl,
    headers,
    provider: envConfig.VISION_API_PROVIDER?.trim() || "zcode",
    model: envConfig.VISION_API_MODEL?.trim() || "",
    reasoningEffort: envConfig.VISION_API_REASONING_EFFORT?.trim() || "",
  }
}

function extractJsonObject(raw: unknown): unknown {
  if (typeof raw === "object" && raw !== null) return raw
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  const candidate = fenced ? fenced[1].trim() : trimmed
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function submitOcrJob(
  envConfig: OcrEnvConfig,
  params: {
    bytes: Uint8Array
    mediaType: string
    width: number
    height: number
  },
  fetchImpl: typeof fetch = fetch
): Promise<{ jobId: string; status: string }> {
  const cfg = resolveOcrConfig(envConfig)
  const form = new FormData()
  form.append("instruction", buildOcrPrompt(params.width, params.height))
  form.append("provider", cfg.provider)
  if (cfg.model) form.append("model", cfg.model)
  if (cfg.reasoningEffort) form.append("reasoning_effort", cfg.reasoningEffort)
  const ext = params.mediaType === "image/webp" ? "webp" : "jpg"
  form.append(
    "image",
    new File([new Uint8Array(params.bytes)], `receipt.${ext}`, {
      type: params.mediaType,
    }),
    `receipt.${ext}`
  )

  const response = await fetchImpl(`${cfg.baseUrl}/v1/jobs`, {
    method: "POST",
    headers: cfg.headers,
    body: form,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new ServiceError(
      502,
      "OCR_SUBMIT_FAILED",
      `vision-api rejected the OCR job (${response.status}).`,
      text.slice(0, 300)
    )
  }

  const payload = (await response.json()) as {
    id?: unknown
    jobId?: unknown
    status?: unknown
  }
  const jobId =
    typeof payload.id === "string"
      ? payload.id
      : typeof payload.jobId === "string"
        ? payload.jobId
        : null
  if (!jobId) {
    throw new ServiceError(
      502,
      "OCR_INVALID_RESPONSE",
      "vision-api did not return a job ID."
    )
  }

  return {
    jobId,
    status: typeof payload.status === "string" ? payload.status : "queued",
  }
}

export async function pollOcrJob(
  envConfig: OcrEnvConfig,
  jobId: string,
  dims: { width: number; height: number },
  fetchImpl: typeof fetch = fetch
): Promise<{
  jobId: string
  status: "queued" | "running" | "completed" | "failed"
  receipt?: ReceiptOcr
  redactions?: RedactionBox[]
  error?: string
}> {
  const cfg = resolveOcrConfig(envConfig)
  const response = await fetchImpl(
    `${cfg.baseUrl}/v1/jobs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: cfg.headers,
    }
  )

  if (!response.ok) {
    throw new ServiceError(
      502,
      "OCR_POLL_FAILED",
      `vision-api job status failed (${response.status}).`
    )
  }

  const payload = (await response.json()) as {
    status?: unknown
    response?: { result?: unknown } | null
    error?: { code?: string; message?: string } | null
  }
  const rawStatus = typeof payload.status === "string" ? payload.status : ""

  if (rawStatus === "failed" || rawStatus === "error") {
    return {
      jobId,
      status: "failed",
      error: payload.error?.message || "OCR job failed.",
    }
  }

  if (rawStatus !== "completed" && rawStatus !== "succeeded" && rawStatus !== "done") {
    return {
      jobId,
      status: rawStatus === "running" || rawStatus === "processing" ? "running" : "queued",
    }
  }

  const rawJson = extractJsonObject(payload.response?.result)
  const parsed = receiptOcrSchema.safeParse(rawJson)
  if (!parsed.success) {
    return {
      jobId,
      status: "failed",
      error: "OCR returned JSON that could not be parsed as a receipt.",
    }
  }

  const redactions = readRedactions(
    (rawJson as { redactions?: unknown } | null)?.redactions,
    dims.width,
    dims.height
  )

  return {
    jobId,
    status: "completed",
    receipt: parsed.data,
    redactions,
  }
}
