import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { requireAdmin } from "@/lib/auth"
import {
  MAX_RECEIPT_UPLOAD_BYTES,
  extractUploadedBytes,
  validateImageUpload,
} from "@/lib/r2-storage"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import { submitOcrJob } from "@/server/services/ocr"

export const Route = createFileRoute("/api/admin/ocr/jobs/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireAdmin(request, env)
          const url = new URL(request.url)
          const width = Number(url.searchParams.get("width") ?? 0) || 0
          const height = Number(url.searchParams.get("height") ?? 0) || 0

          const extracted = await extractUploadedBytes(
            request,
            MAX_RECEIPT_UPLOAD_BYTES
          )
          if (!extracted.ok) {
            return jsonNoStore({ error: extracted.error }, extracted.status)
          }

          const validated = validateImageUpload(
            extracted.bytes,
            MAX_RECEIPT_UPLOAD_BYTES
          )
          if (!validated.ok) {
            return jsonNoStore({ error: validated.error }, validated.status)
          }

          const job = await submitOcrJob(env, {
            bytes: extracted.bytes,
            mediaType: validated.mediaType,
            width,
            height,
          })

          return jsonNoStore(job, 202)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
