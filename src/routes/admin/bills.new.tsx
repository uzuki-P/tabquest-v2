import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  DotsSixVertical,
  FloppyDisk,
  Minus,
  PaperPlaneTilt,
  Plus,
  Scan,
  Sparkle,
  Trash,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react"
import {
  createFileRoute,
  useBlocker,
  useNavigate,
} from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"

import { AdminShell } from "@/components/admin/AdminShell"
import { ReceiptRedactor } from "@/components/admin/ReceiptRedactor"
import type { CensorBox, CropRect } from "@/components/admin/ReceiptRedactor"
import { DatePicker } from "@/components/telemetry/DatePicker"
import {
  CurrencyInput,
  PlayerAvatar,
  SelectMenu,
  fmtDate,
} from "@/components/telemetry/components"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatRupiah } from "@/domain/money"
import {
  SplitValidationError,
  computeSplit,
  itemUnits,
  splitsEqually,
} from "@/domain/split"
import type { SplitIssue, SplitResult } from "@/domain/split"
import { useAppStore } from "@/lib/app-store"
import {
  prepareReceiptForOcr,
  prepareReceiptForStorage,
} from "@/lib/image-edits"
import { todayJakarta } from "@/lib/time"
import type { UpsertBillInput } from "@/server/services/bills"

export const Route = createFileRoute("/admin/bills/new")({
  component: AdminNewBillPage,
})

const BILL_STEPS = [
  { title: "Receipt", description: "Where the numbers come from" },
  { title: "Items & fees", description: "Lines and order-wide adjustments" },
  { title: "People", description: "Who is in this order" },
  { title: "Split & review", description: "Drag items into player baskets" },
] as const

interface DraftItem {
  id: string
  name: string
  variantNotes: string
  quantity: number
  bundleSize: number
  unitPrice: number
}

interface DraftAdjustment {
  id: string
  type: "discount" | "delivery" | "service" | "tax" | "other"
  label: string
  amount: number
}

const ITEM_TINTS = [
  "border-l-[var(--rt-accent)]",
  "border-l-[var(--rt-teal)]",
  "border-l-[var(--rt-amber)]",
  "border-l-[var(--rt-ink)]",
] as const

function describeIssue(issue: SplitIssue): string {
  switch (issue.code) {
    case "no-items":
      return "Add at least one receipt item."
    case "no-players":
      return "Select at least one player in Step 3."
    case "item-quantity-mismatch":
      return `"${issue.name}": assigned ${issue.assigned} of ${issue.ordered} units.`
    case "subtotal-mismatch":
      return `Items sum to ${formatRupiah(issue.actual)}, expected ${formatRupiah(issue.expected)}.`
    case "final-total-mismatch":
      return `Grand total is ${formatRupiah(issue.actual)}, expected ${formatRupiah(issue.expected)}.`
    case "invalid-item-quantity":
      return "Every item must have quantity of at least 1."
    case "invalid-unit-price":
      return "Unit prices cannot be negative."
    default:
      return issue.code.replace(/-/g, " ")
  }
}

function NumberStepper({
  id,
  label,
  value,
  min = 1,
  onChange,
}: {
  id: string
  label: string
  value: number
  min?: number
  onChange: (next: number) => void
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[13px] font-bold text-[var(--rt-muted)]"
      >
        {label}
      </label>
      <div className="mt-1 flex h-12 items-center rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] focus-within:border-[var(--rt-accent)]">
        <button
          type="button"
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="rt2-focus flex h-full w-9 shrink-0 cursor-pointer items-center justify-center border-r border-[var(--rt-border-soft)] text-[var(--rt-ink)] transition hover:bg-[var(--rt-bg)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus size={14} weight="bold" />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={String(value)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "")
            if (!digits) return
            onChange(Math.max(min, Number(digits)))
          }}
          className="tnum h-full w-full min-w-0 bg-transparent px-1 text-center font-arcade-mono text-[15px] font-bold text-[var(--rt-ink)] focus:outline-none"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value + 1)}
          className="rt2-focus flex h-full w-9 shrink-0 cursor-pointer items-center justify-center border-l border-[var(--rt-border-soft)] text-[var(--rt-ink)] transition hover:bg-[var(--rt-bg)]"
        >
          <Plus size={14} weight="bold" />
        </button>
      </div>
    </div>
  )
}

function AdminNewBillPage() {
  const navigate = useNavigate()
  const { players, roundingPlayerId, createBill, pushToast } = useAppStore()

  const [step, setStep] = useState(0)
  const [stepDir, setStepDir] = useState<"right" | "left">("right")
  const allowLeaveRef = useRef(false)

  const goToStep = (next: number) => {
    if (next === step) return
    setStepDir(next > step ? "right" : "left")
    setStep(next)
  }

  const [merchant, setMerchant] = useState("")
  const [title, setTitle] = useState("")
  const [orderDate, setOrderDate] = useState(() => todayJakarta())
  const [ocrStatus, setOcrStatus] = useState<
    "idle" | "queued" | "reading" | "done" | "error"
  >("idle")
  const [ocrMessage, setOcrMessage] = useState<string>("")
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null)
  const [censorBoxes, setCensorBoxes] = useState<CensorBox[]>([])
  const [receiptCrop, setReceiptCrop] = useState<CropRect | null>(null)
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleImagePickOnly = (file: File) => {
    setSourceFile(file)
    setUploadedFileName(file.name)
    if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl)
    setUploadedImageUrl(URL.createObjectURL(file))
    setCensorBoxes([])
    setReceiptCrop(null)
    setOcrStatus("idle")
    setOcrMessage("")
  }

  const clearFormFields = () => {
    setMerchant("")
    setTitle("")
    setOcrStatus("idle")
    setOcrMessage("")
    setItems([
      {
        id: `i-${Date.now()}`,
        name: "",
        variantNotes: "",
        quantity: 1,
        bundleSize: 1,
        unitPrice: 0,
      },
    ])
    setAdjustments([])
    setAllocMap({})
  }

  useEffect(() => {
    return () => {
      if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl)
    }
  }, [uploadedImageUrl])

  const [items, setItems] = useState<DraftItem[]>([
    {
      id: "i-1",
      name: "",
      variantNotes: "",
      quantity: 1,
      bundleSize: 1,
      unitPrice: 0,
    },
  ])

  const [adjustments, setAdjustments] = useState<DraftAdjustment[]>([])

  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])

  const [allocMap, setAllocMap] = useState<Record<string, number>>({})

  // Drag-and-drop state for Step 4
  const [dragPayload, setDragPayload] = useState<{
    itemId: string
    from: "counter" | string
  } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const itemSubtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const adjustmentsTotal = adjustments.reduce((s, a) => s + a.amount, 0)
  const finalTotal = itemSubtotal + adjustmentsTotal
  const merchantMissing = merchant.trim() === ""

  const buildImageEdits = () => ({
    boxes: censorBoxes
      .filter((b) => b.enabled)
      .map((b) => ({
        x: b.x,
        y: b.y,
        width: b.w,
        height: b.h,
        label: b.label,
      })),
    crop: receiptCrop
      ? {
          x: receiptCrop.x,
          y: receiptCrop.y,
          width: receiptCrop.w,
          height: receiptCrop.h,
        }
      : null,
  })

  const runRealOcr = async () => {
    if (!sourceFile) {
      pushToast("Upload a receipt photo first.")
      return
    }
    setOcrStatus("queued")
    setOcrMessage(`Preparing ${sourceFile.name} for OCR...`)
    try {
      const prepared = await prepareReceiptForOcr(
        sourceFile,
        { boxes: [], crop: null },
        sourceFile.name
      )
      const bitmap = await createImageBitmap(prepared)
      const width = bitmap.width
      const height = bitmap.height
      bitmap.close()

      const form = new FormData()
      form.append("file", prepared, prepared.name)
      const submitRes = await fetch(
        `/api/admin/ocr/jobs?width=${width}&height=${height}`,
        {
          method: "POST",
          credentials: "include",
          body: form,
        }
      )
      const submitJson = (await submitRes.json().catch(() => ({}))) as {
        jobId?: string
        error?: string
      }
      if (!submitRes.ok || !submitJson.jobId) {
        const msg =
          submitJson.error || `OCR submission failed (${submitRes.status}).`
        setOcrStatus("error")
        setOcrMessage(msg)
        pushToast(msg)
        return
      }

      setOcrStatus("reading")
      setOcrMessage("Reading receipt items via vision-api...")
      const jobId = submitJson.jobId

      // Poll every 2.5s up to 40 attempts (~100s)
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((r) => window.setTimeout(r, 2500))
        const pollRes = await fetch(
          `/api/admin/ocr/jobs/${encodeURIComponent(jobId)}?width=${width}&height=${height}`,
          { credentials: "include" }
        )
        const pollJson = (await pollRes.json().catch(() => ({}))) as {
          status?: string
          error?: string
          receipt?: {
            merchant: string
            orderDate: string
            items: Array<{
              name: string
              variantNotes: string
              quantity: number
              unitPrice: number
            }>
            adjustments: Array<{
              type: DraftAdjustment["type"]
              label: string
              amount: number
            }>
          }
          redactions?: Array<{
            x: number
            y: number
            width: number
            height: number
            label?: string
          }>
        }

        if (!pollRes.ok || pollJson.status === "failed") {
          const msg = pollJson.error || "OCR job failed."
          setOcrStatus("error")
          setOcrMessage(msg)
          pushToast(msg)
          return
        }

        if (pollJson.status === "completed" && pollJson.receipt) {
          const r = pollJson.receipt
          if (r.merchant) setMerchant(r.merchant)
          if (r.orderDate) setOrderDate(r.orderDate)
          if (r.items.length > 0) {
            setItems(
              r.items.map((it, idx) => ({
                id: `i-ocr-${Date.now()}-${idx}`,
                name: it.name,
                variantNotes: it.variantNotes,
                quantity: Math.max(1, it.quantity),
                bundleSize: 1,
                unitPrice: Math.max(0, it.unitPrice),
              }))
            )
            setAllocMap({})
          }
          setAdjustments(
            r.adjustments.map((adj, idx) => ({
              id: `a-ocr-${Date.now()}-${idx}`,
              type: adj.type,
              label: adj.label || adj.type,
              amount: adj.amount,
            }))
          )
          if (pollJson.redactions && pollJson.redactions.length > 0) {
            setCensorBoxes(
              pollJson.redactions.map((box, idx) => ({
                id: `r-ocr-${idx}`,
                label: box.label || "Redacted PII",
                x: box.x,
                y: box.y,
                w: box.width,
                h: box.height,
                enabled: true,
                suggested: true,
              }))
            )
          }
          setOcrStatus("done")
          setOcrMessage(
            `Filled ${r.items.length} items and ${r.adjustments.length} adjustments from ${sourceFile.name}`
          )
          pushToast("Receipt parsed! Review items before publishing.")
          return
        }
      }

      setOcrStatus("error")
      setOcrMessage("OCR timed out. You can still enter items manually.")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OCR failed."
      setOcrStatus("error")
      setOcrMessage(msg)
      pushToast(msg)
    }
  }

  const togglePlayer = (playerId: string) => {
    setSelectedPlayerIds((prev) => {
      if (prev.includes(playerId)) {
        const next = prev.filter((id) => id !== playerId)
        setAllocMap((curr) => {
          const copy = { ...curr }
          for (const key of Object.keys(copy)) {
            if (key.endsWith(`::${playerId}`)) delete copy[key]
          }
          return copy
        })
        return next
      }
      return [...prev, playerId]
    })
  }

  const assignedForItem = (itemId: string) =>
    selectedPlayerIds.reduce(
      (sum, pid) => sum + (allocMap[`${itemId}::${pid}`] ?? 0),
      0
    )

  const stepAlloc = (item: DraftItem, playerId: string, delta: number) => {
    const key = `${item.id}::${playerId}`
    const ordered = itemUnits(item.quantity, item.bundleSize)
    setAllocMap((prev) => {
      const current = prev[key] ?? 0
      const others = selectedPlayerIds.reduce(
        (sum, pid) =>
          pid === playerId ? sum : sum + (prev[`${item.id}::${pid}`] ?? 0),
        0
      )
      const capacity = Math.max(0, ordered - others)
      const nextVal = Math.max(0, Math.min(capacity, current + delta))
      const copy = { ...prev }
      if (nextVal === 0) delete copy[key]
      else copy[key] = nextVal
      return copy
    })
  }

  const moveUnit = (
    itemId: string,
    from: "counter" | string,
    to: "counter" | string
  ) => {
    if (from === to) return
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    const ordered = itemUnits(item.quantity, item.bundleSize)

    setAllocMap((prev) => {
      const copy = { ...prev }
      if (from !== "counter") {
        const fromKey = `${itemId}::${from}`
        const fromQty = copy[fromKey] ?? 0
        if (fromQty <= 0) return prev
        if (fromQty === 1) delete copy[fromKey]
        else copy[fromKey] = fromQty - 1
      }
      if (to !== "counter") {
        const toKey = `${itemId}::${to}`
        const assignedNow = selectedPlayerIds.reduce(
          (sum, pid) => sum + (copy[`${itemId}::${pid}`] ?? 0),
          0
        )
        if (assignedNow >= ordered) return prev
        copy[toKey] = (copy[toKey] ?? 0) + 1
      }
      return copy
    })
  }

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `i-${Date.now()}`,
        name: "",
        variantNotes: "",
        quantity: 1,
        bundleSize: 1,
        unitPrice: 25000,
      },
    ])
  }

  const addAdjustment = (type: DraftAdjustment["type"]) => {
    setAdjustments((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        type,
        label:
          type === "discount"
            ? "Voucher discount"
            : type === "delivery"
              ? "Delivery fee"
              : type === "tax"
                ? "PB1 Tax"
                : "Service fee",
        amount: type === "discount" ? -10000 : 3000,
      },
    ])
  }

  // Real domain split calculation (runs live across all 4 steps)
  const splitEval = useMemo<{
    result: SplitResult | null
    issues: SplitIssue[]
  }>(() => {
    const billPlayers = selectedPlayerIds.map((id) => ({ id }))
    const allocations = Object.entries(allocMap)
      .filter(([, qty]) => qty > 0)
      .map(([key, quantity]) => {
        const [itemId, billPlayerId] = key.split("::")
        return { itemId, billPlayerId, quantity }
      })
    try {
      const result = computeSplit({
        items: items.map((i) => ({
          id: i.id,
          name: i.name || "Unnamed item",
          quantity: i.quantity,
          bundleSize: i.bundleSize,
          unitPrice: i.unitPrice,
          lineTotal: i.quantity * i.unitPrice,
        })),
        billPlayers,
        allocations,
        adjustments: adjustments.map((a) => ({
          id: a.id,
          type: a.type,
          amount: a.amount,
        })),
        sourceSubtotal: itemSubtotal,
        finalTotal,
        splitVersion: 2,
        roundingBillPlayerId:
          roundingPlayerId && selectedPlayerIds.includes(roundingPlayerId)
            ? roundingPlayerId
            : undefined,
      })
      return { result, issues: [] }
    } catch (err) {
      if (err instanceof SplitValidationError) {
        return { result: null, issues: err.issues }
      }
      return { result: null, issues: [] }
    }
  }, [
    items,
    selectedPlayerIds,
    allocMap,
    adjustments,
    itemSubtotal,
    finalTotal,
    roundingPlayerId,
  ])

  const totalOrderedUnits = items.reduce(
    (s, i) => s + itemUnits(i.quantity, i.bundleSize),
    0
  )
  const totalAssignedUnits = items.reduce(
    (s, i) =>
      s + Math.min(assignedForItem(i.id), itemUnits(i.quantity, i.bundleSize)),
    0
  )
  const allocPct =
    totalOrderedUnits > 0
      ? Math.round((totalAssignedUnits / totalOrderedUnits) * 100)
      : 0

  const hasUnsavedChanges =
    merchant.trim().length > 0 ||
    title.trim().length > 0 ||
    sourceFile !== null ||
    items.length > 0 ||
    adjustments.length > 0 ||
    selectedPlayerIds.length > 0 ||
    Object.keys(allocMap).length > 0

  const leaveBlocker = useBlocker({
    shouldBlockFn: () => !allowLeaveRef.current && hasUnsavedChanges,
    withResolver: true,
    enableBeforeUnload: () => !allowLeaveRef.current && hasUnsavedChanges,
  })

  const handlePublish = async (asDraft: boolean) => {
    if (submitting) return
    if (!asDraft && !splitEval.result) return
    setSubmitting(true)
    try {
      let uploadedReceipt: {
        objectKey: string
        mediaType: string
        byteSize: number
      } | null = null

      if (sourceFile) {
        const prepared = await prepareReceiptForStorage(
          sourceFile,
          buildImageEdits(),
          sourceFile.name
        )
        const form = new FormData()
        form.append("file", prepared, prepared.name)
        const uploadRes = await fetch("/api/admin/uploads/receipt", {
          method: "POST",
          credentials: "include",
          body: form,
        })
        if (!uploadRes.ok) {
          const errJson = (await uploadRes.json().catch(() => ({}))) as {
            error?: string
          }
          pushToast(errJson.error || "Receipt image upload failed.")
          return
        }
        uploadedReceipt = (await uploadRes.json()) as {
          objectKey: string
          mediaType: string
          byteSize: number
        }
      }

      const payload: UpsertBillInput = {
        merchant: merchant.trim() || "Untitled Bill",
        title: title.trim() || null,
        orderDate,
        publish: !asDraft,
        imageObjectKey: uploadedReceipt?.objectKey ?? null,
        imageMediaType: uploadedReceipt?.mediaType ?? null,
        imageByteSize: uploadedReceipt?.byteSize ?? null,
        items: items.map((i) => ({
          id: i.id,
          name: i.name.trim() || "Unnamed item",
          variantNotes: i.variantNotes.trim() || null,
          quantity: i.quantity,
          bundleSize: i.bundleSize,
          unitPrice: i.unitPrice,
        })),
        adjustments: adjustments.map((a) => ({
          id: a.id,
          type: a.type,
          label: a.label.trim() || a.type,
          signedAmount: a.amount,
        })),
        billPlayers: selectedPlayerIds.map((pid) => {
          const p = players.find((x) => x.id === pid)
          return {
            id: pid,
            playerId: pid,
            alias: p?.name ?? "Player",
          }
        }),
        allocations: Object.entries(allocMap)
          .filter(([, qty]) => qty > 0)
          .map(([key, quantity]) => {
            const [itemKey, billPlayerKey] = key.split("::")
            return { itemKey, billPlayerKey, quantity }
          }),
      }

      const created = await createBill(payload)
      if (!created) return

      allowLeaveRef.current = true
      if (asDraft) {
        void navigate({ to: "/admin" })
      } else {
        void navigate({
          to: "/b/$publicId",
          params: { publicId: created.publicId },
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminShell
      title="New Bill"
      subtitle="Follow the 4-step receipt flow while checking live per-player totals on the right."
    >
      {/* Classic 4-step Wizard Pills */}
      <ol
        className="flex flex-wrap items-center gap-2"
        aria-label="New bill steps"
      >
        {BILL_STEPS.map((entry, index) => {
          const state =
            index < step ? "done" : index === step ? "current" : "todo"
          const blocked = merchantMissing && index > 0
          return (
            <li key={entry.title} className="flex items-center gap-2">
              <button
                type="button"
                disabled={blocked}
                onClick={() => goToStep(index)}
                aria-current={state === "current" ? "step" : undefined}
                title={blocked ? "Add the merchant name first" : undefined}
                className={`rt2-focus inline-flex min-h-[40px] items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-[14px] font-bold transition ${
                  state === "current"
                    ? "border-[var(--rt-accent)] bg-[var(--rt-accent)] text-[var(--rt-accent-fg)]"
                    : state === "done"
                      ? "cursor-pointer border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)] hover:brightness-95"
                      : "cursor-pointer border-[var(--rt-ui-border)] bg-[var(--rt-surface)] text-[var(--rt-muted)] hover:border-[var(--rt-ink)] hover:text-[var(--rt-ink)]"
                } ${blocked ? "cursor-not-allowed opacity-40" : ""}`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full font-arcade-mono text-[12px] font-bold ${
                    state === "current"
                      ? "bg-[var(--rt-accent-fg)] text-[var(--rt-accent)]"
                      : state === "done"
                        ? "bg-[var(--rt-teal)] text-white"
                        : "border border-current"
                  }`}
                >
                  {state === "done" ? <Check size={12} weight="bold" /> : index + 1}
                </span>
                {entry.title}
              </button>
              {index < BILL_STEPS.length - 1 && (
                <ArrowRight
                  size={14}
                  weight="bold"
                  className="text-[var(--rt-muted)]"
                />
              )}
            </li>
          )
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left 8 Cols: Active Wizard Step */}
        <div className="space-y-5 lg:col-span-8">
          <div
            key={step}
            className={`space-y-5 ${
              stepDir === "right" ? "rt2-panel-in-right" : "rt2-panel-in-left"
            }`}
          >
            {/* STEP 1: RECEIPT + MANUAL CENSOR + CUSTOM DATE PICKER */}
            {step === 0 && (
              <>
                <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rt-border-soft)] pb-3">
                    <div>
                      <h2 className="rt2-display text-2xl font-extrabold">
                        Receipt photo, Crop &amp; Manual Censor
                      </h2>
                      <p className="text-[14px] text-[var(--rt-muted)]">
                        Upload a photo for reference or crop &amp; censor it.
                        OCR only runs when you press Parse with OCR.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="rt2-focus rt2-btn-secondary inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded px-3 text-[14px] font-bold">
                        <UploadSimple size={16} weight="bold" />
                        Choose image
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) handleImagePickOnly(f)
                            e.target.value = ""
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void runRealOcr()}
                        className="rt2-focus rt2-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded px-3.5 text-[14px] font-bold"
                      >
                        <Sparkle size={16} weight="bold" />
                        Parse with OCR
                      </button>
                      <button
                        type="button"
                        onClick={clearFormFields}
                        className="rt2-focus rt2-btn-secondary inline-flex min-h-[40px] items-center gap-1.5 rounded px-3 text-[14px] font-bold"
                      >
                        Clear form
                      </button>
                    </div>
                  </div>

                  {ocrStatus !== "idle" && (
                    <div
                      role="status"
                      className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded border-2 px-3.5 py-2.5 font-arcade-mono text-[14px] font-bold ${
                        ocrStatus === "done"
                          ? "border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
                          : ocrStatus === "error"
                            ? "border-[var(--rt-accent)] bg-[var(--rt-accent-soft)] text-[var(--rt-accent-ink)]"
                            : "border-[var(--rt-amber)] bg-[var(--rt-amber-soft)] text-[var(--rt-amber-ink)]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Scan size={16} weight="bold" />
                        {ocrMessage ||
                          (ocrStatus === "queued"
                            ? `Job queued (${uploadedFileName})...`
                            : ocrStatus === "reading"
                              ? "Reading items, discounts & PII boxes..."
                              : `Parsed ${uploadedFileName}`)}
                      </span>
                      <span>{ocrStatus.toUpperCase()}</span>
                    </div>
                  )}

                  <ReceiptRedactor
                    imageUrl={uploadedImageUrl}
                    merchant={merchant}
                    orderDate={orderDate}
                    items={items}
                    finalTotal={finalTotal}
                    boxes={censorBoxes}
                    onChange={setCensorBoxes}
                    crop={receiptCrop}
                    onCropChange={setReceiptCrop}
                    onPickFile={handleImagePickOnly}
                  />
                </section>

                <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
                  <h2 className="rt2-display text-2xl font-extrabold">
                    Bill header
                  </h2>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="bill-merchant"
                        className="block text-[14px] font-bold text-[var(--rt-muted)]"
                      >
                        Merchant name
                      </label>
                      <input
                        id="bill-merchant"
                        type="text"
                        value={merchant}
                        onChange={(e) => setMerchant(e.target.value)}
                        placeholder="e.g. Kopi Tuku Kemang"
                        className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 text-[15px] font-semibold"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="bill-title"
                        className="block text-[14px] font-bold text-[var(--rt-muted)]"
                      >
                        Short title (optional)
                      </label>
                      <input
                        id="bill-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Friday lunch"
                        className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 text-[15px]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="bill-date"
                        className="block text-[14px] font-bold text-[var(--rt-muted)]"
                      >
                        Order date
                      </label>
                      <div className="mt-1">
                        <DatePicker
                          id="bill-date"
                          value={orderDate}
                          onChange={setOrderDate}
                        />
                      </div>
                    </div>
                    <div className="rounded border border-[var(--rt-ui-border)] bg-[var(--rt-bg)] px-3.5 py-2">
                      <p className="text-[13px] font-bold text-[var(--rt-muted)]">
                        Auto-calculated total
                      </p>
                      <p className="tnum mt-0.5 font-arcade-mono text-[18px] font-bold">
                        {formatRupiah(finalTotal)}
                      </p>
                    </div>
                  </div>
                </section>
              </>
            )}

            {/* STEP 2: ITEMS & FEES */}
            {step === 1 && (
              <>
                <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rt-border-soft)] pb-3">
                    <div>
                      <h2 className="rt2-display text-2xl font-extrabold">
                        Receipt items ({items.length})
                      </h2>
                      <p className="text-[14px] text-[var(--rt-muted)]">
                        Line totals are computed automatically from Qty x Unit
                        price.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addItem}
                      className="rt2-focus rt2-btn-secondary inline-flex min-h-[40px] items-center gap-1.5 rounded px-3.5 text-[14px] font-bold"
                    >
                      <Plus size={15} weight="bold" />
                      Add item
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {items.map((item, idx) => {
                      const lineTotal = item.quantity * item.unitPrice
                      const splitUnits = itemUnits(
                        item.quantity,
                        item.bundleSize
                      )
                      return (
                        <div
                          key={item.id}
                          className="rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-bg)] p-4"
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label
                                htmlFor={`item-name-${item.id}`}
                                className="block text-[13px] font-bold text-[var(--rt-muted)]"
                              >
                                Item #{idx + 1} name
                              </label>
                              <input
                                id={`item-name-${item.id}`}
                                type="text"
                                value={item.name}
                                placeholder="e.g. Salmon Nigiri Box"
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((x) =>
                                      x.id === item.id
                                        ? { ...x, name: e.target.value }
                                        : x
                                    )
                                  )
                                }
                                className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] px-3 text-[15px] font-semibold"
                              />
                            </div>

                            <div>
                              <label
                                htmlFor={`item-variant-${item.id}`}
                                className="block text-[13px] font-bold text-[var(--rt-muted)]"
                              >
                                Variant / notes
                              </label>
                              <input
                                id={`item-variant-${item.id}`}
                                type="text"
                                value={item.variantNotes}
                                placeholder="Optional (e.g. Less ice, Extra spicy)"
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((x) =>
                                      x.id === item.id
                                        ? { ...x, variantNotes: e.target.value }
                                        : x
                                    )
                                  )
                                }
                                className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] px-3 text-[14px]"
                              />
                            </div>
                          </div>

                          <div className="mt-3 grid gap-3 sm:grid-cols-[124px_124px_minmax(190px,1fr)_auto] sm:items-end">
                            <NumberStepper
                              id={`item-qty-${item.id}`}
                              label="Qty"
                              value={item.quantity}
                              onChange={(val) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.id === item.id
                                      ? { ...x, quantity: val }
                                      : x
                                  )
                                )
                              }
                            />

                            <NumberStepper
                              id={`item-bundle-${item.id}`}
                              label="Items / qty"
                              value={item.bundleSize}
                              onChange={(val) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.id === item.id
                                      ? { ...x, bundleSize: val }
                                      : x
                                  )
                                )
                              }
                            />

                            <CurrencyInput
                              label="Unit price"
                              value={item.unitPrice}
                              onChange={(val) =>
                                setItems((prev) =>
                                  prev.map((x) =>
                                    x.id === item.id
                                      ? { ...x, unitPrice: val }
                                      : x
                                  )
                                )
                              }
                            />

                            <button
                              type="button"
                              aria-label={`Remove ${item.name || "item"}`}
                              onClick={() =>
                                setItems((prev) =>
                                  prev.filter((x) => x.id !== item.id)
                                )
                              }
                              className="rt2-focus rt2-btn-secondary inline-flex h-12 w-12 items-center justify-center rounded text-[var(--rt-muted)] hover:text-[var(--rt-accent-ink)]"
                            >
                              <Trash size={18} weight="bold" />
                            </button>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rt-border-soft)] pt-2 font-arcade-mono text-[13px] text-[var(--rt-muted)]">
                            <span>
                              Line total: {item.quantity} x{" "}
                              {formatRupiah(item.unitPrice)} ={" "}
                              <strong className="tnum text-[var(--rt-ink)]">
                                {formatRupiah(lineTotal)}
                              </strong>
                            </span>
                            {item.bundleSize > 1 && (
                              <span>
                                {splitUnits} units to split (~
                                {formatRupiah(Math.round(lineTotal / splitUnits))}
                                /unit)
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>

                <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rt-border-soft)] pb-3">
                    <div>
                      <h2 className="rt2-display text-2xl font-extrabold">
                        Order-wide adjustments ({adjustments.length})
                      </h2>
                      <p className="text-[14px] text-[var(--rt-muted)]">
                        Discounts & tax split by item share. Delivery & service
                        fees split equally per head.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => addAdjustment("discount")}
                        className="rt2-focus rt2-btn-secondary inline-flex min-h-[38px] items-center gap-1 rounded px-3 text-[13px] font-bold"
                      >
                        <Plus size={14} weight="bold" />
                        Discount
                      </button>
                      <button
                        type="button"
                        onClick={() => addAdjustment("delivery")}
                        className="rt2-focus rt2-btn-secondary inline-flex min-h-[38px] items-center gap-1 rounded px-3 text-[13px] font-bold"
                      >
                        <Plus size={14} weight="bold" />
                        Fee
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {adjustments.map((adj) => {
                      const isEqual = splitsEqually({
                        id: adj.id,
                        type: adj.type,
                        amount: adj.amount,
                      })
                      return (
                        <div
                          key={adj.id}
                          className="grid grid-cols-1 gap-3 rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-bg)] p-3.5 sm:grid-cols-[140px_minmax(0,1fr)_210px_auto] sm:items-end"
                        >
                          <div>
                            <p className="mb-1 text-[13px] font-bold text-[var(--rt-muted)]">
                              Type
                            </p>
                            <SelectMenu
                              ariaLabel="Adjustment type"
                              minWidthClass="w-full"
                              value={adj.type}
                              onChange={(nextType) =>
                                setAdjustments((prev) =>
                                  prev.map((x) =>
                                    x.id === adj.id
                                      ? {
                                          ...x,
                                          type: nextType,
                                          amount:
                                            nextType === "discount"
                                              ? -Math.abs(x.amount)
                                              : Math.abs(x.amount),
                                        }
                                      : x
                                  )
                                )
                              }
                              options={[
                                { value: "discount", label: "Discount" },
                                { value: "delivery", label: "Delivery" },
                                { value: "service", label: "Service" },
                                { value: "tax", label: "Tax" },
                                { value: "other", label: "Other" },
                              ]}
                            />
                          </div>

                          <div>
                            <label
                              htmlFor={`adj-label-${adj.id}`}
                              className="block text-[13px] font-bold text-[var(--rt-muted)]"
                            >
                              Label ({isEqual ? "equal per head" : "by item share"})
                            </label>
                            <input
                              id={`adj-label-${adj.id}`}
                              type="text"
                              value={adj.label}
                              onChange={(e) =>
                                setAdjustments((prev) =>
                                  prev.map((x) =>
                                    x.id === adj.id
                                      ? { ...x, label: e.target.value }
                                      : x
                                  )
                                )
                              }
                              className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] px-3 text-[14px] font-semibold"
                            />
                          </div>

                          <CurrencyInput
                            label={
                              adj.type === "discount"
                                ? "Discount amount (-)"
                                : "Fee amount (+)"
                            }
                            value={Math.abs(adj.amount)}
                            onChange={(val) =>
                              setAdjustments((prev) =>
                                prev.map((x) =>
                                  x.id === adj.id
                                    ? {
                                        ...x,
                                        amount:
                                          x.type === "discount" ? -val : val,
                                      }
                                    : x
                                )
                              )
                            }
                          />

                          <button
                            type="button"
                            aria-label={`Remove ${adj.label}`}
                            onClick={() =>
                              setAdjustments((prev) =>
                                prev.filter((x) => x.id !== adj.id)
                              )
                            }
                            className="rt2-focus rt2-btn-secondary inline-flex h-12 w-12 items-center justify-center rounded text-[var(--rt-muted)] hover:text-[var(--rt-accent-ink)]"
                          >
                            <Trash size={17} weight="bold" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </section>
              </>
            )}

            {/* STEP 3: PEOPLE */}
            {step === 2 && (
              <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
                <h2 className="rt2-display text-2xl font-extrabold">
                  Who is in this order? ({selectedPlayerIds.length} selected)
                </h2>
                <p className="mt-0.5 text-[14px] text-[var(--rt-muted)]">
                  Pick everyone who ordered so their basket appears in Step 4.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {players.map((p) => {
                    const active = selectedPlayerIds.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => togglePlayer(p.id)}
                        className={`rt2-focus flex min-h-[64px] cursor-pointer items-center justify-between gap-3 rounded border-2 p-3.5 text-left transition ${
                          active
                            ? "border-[var(--rt-accent)] bg-[var(--rt-accent-soft)]"
                            : "border-[var(--rt-ui-border)] bg-[var(--rt-bg)] hover:border-[var(--rt-ink)]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <PlayerAvatar player={p} size="md" />
                          <div>
                            <p className="text-[16px] font-bold">{p.name}</p>
                            <p className="font-arcade-mono text-[13px] text-[var(--rt-muted)]">
                              {p.handle}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                            active
                              ? "border-[var(--rt-accent)] bg-[var(--rt-accent)] text-[var(--rt-accent-fg)]"
                              : "border-[var(--rt-ui-border)]"
                          }`}
                        >
                          {active && <Check size={14} weight="bold" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* STEP 4: DRAG-AND-DROP SPLIT BOARD (v1 Counter -> Player Baskets) */}
            {step === 3 && (
              <section className="space-y-4 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="rt2-display text-2xl font-extrabold">
                      Drag items into player baskets
                    </h2>
                    <p className="text-[14px] text-[var(--rt-muted)]">
                      Drag cards from the Counter into any basket, between
                      baskets, or back to the Counter. You can also use + / -.
                    </p>
                  </div>
                  <span className="tnum font-arcade-mono text-[14px] font-bold text-[var(--rt-teal-ink)]">
                    {totalAssignedUnits} / {totalOrderedUnits} assigned (
                    {allocPct}%)
                  </span>
                </div>

                <div className="h-2.5 w-full overflow-hidden rounded-sm border border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)]">
                  <div
                    className="h-full transition-all duration-200"
                    style={{
                      width: `${allocPct}%`,
                      backgroundColor:
                        allocPct >= 100
                          ? "var(--rt-chunk-paid)"
                          : "var(--rt-accent)",
                    }}
                  />
                </div>

                {/* Counter Drop Zone */}
                <div
                  onDragOver={(e) => {
                    if (!dragPayload || dragPayload.from === "counter") return
                    e.preventDefault()
                    setDropTarget("counter")
                  }}
                  onDragLeave={() =>
                    setDropTarget((curr) => (curr === "counter" ? null : curr))
                  }
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragPayload && dragPayload.from !== "counter") {
                      moveUnit(dragPayload.itemId, dragPayload.from, "counter")
                    }
                    setDragPayload(null)
                    setDropTarget(null)
                  }}
                  className={`rounded border-2 border-dashed p-4 transition-colors ${
                    dropTarget === "counter"
                      ? "border-[var(--rt-accent)] bg-[var(--rt-accent-soft)]"
                      : "border-[var(--rt-ui-border)] bg-[var(--rt-bg)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-arcade-mono text-[13px] font-bold uppercase text-[var(--rt-muted)]">
                      Counter (drag here to unassign)
                    </p>
                    {dropTarget === "counter" && (
                      <span className="font-arcade-mono text-[12px] font-bold text-[var(--rt-accent-ink)]">
                        Drop to return to Counter
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {items.map((item, idx) => {
                      const ordered = itemUnits(item.quantity, item.bundleSize)
                      const rem = ordered - assignedForItem(item.id)
                      if (rem <= 0) return null
                      const tint = ITEM_TINTS[idx % ITEM_TINTS.length]
                      const unitCost = Math.round(
                        (item.quantity * item.unitPrice) / ordered
                      )
                      return (
                        <div
                          key={item.id}
                          draggable
                          title={
                            item.variantNotes
                              ? `${item.name} (${item.variantNotes}) - ${formatRupiah(unitCost)}/unit`
                              : `${item.name} - ${formatRupiah(unitCost)}/unit`
                          }
                          onDragStart={() =>
                            setDragPayload({ itemId: item.id, from: "counter" })
                          }
                          onDragEnd={() => {
                            setDragPayload(null)
                            setDropTarget(null)
                          }}
                          className={`group relative flex cursor-grab items-center gap-2.5 rounded border-2 border-[var(--rt-border)] border-l-4 ${tint} bg-[var(--rt-surface)] px-3 py-2 shadow-xs active:cursor-grabbing`}
                        >
                          <DotsSixVertical
                            size={16}
                            weight="bold"
                            className="shrink-0 text-[var(--rt-muted)]"
                          />
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                              <p className="text-[14px] font-bold">
                                {item.name || "Unnamed item"}{" "}
                                <span className="tnum font-arcade-mono text-[13px] text-[var(--rt-accent-ink)]">
                                  x{rem}
                                </span>
                              </p>
                              <span className="tnum font-arcade-mono text-[13px] font-semibold text-[var(--rt-muted)]">
                                {formatRupiah(unitCost)}
                              </span>
                            </div>
                            {item.variantNotes && (
                              <p className="max-w-[220px] truncate text-[12px] text-[var(--rt-muted)]">
                                {item.variantNotes}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {selectedPlayerIds.map((pid) => {
                                const p = players.find((x) => x.id === pid)
                                return (
                                  <button
                                    key={pid}
                                    type="button"
                                    onClick={() => stepAlloc(item, pid, 1)}
                                    className="rt2-focus rt2-btn-secondary inline-flex h-6 items-center gap-0.5 rounded px-1.5 text-[11px] font-bold"
                                  >
                                    <Plus size={10} weight="bold" />
                                    {p?.name ?? pid}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {totalAssignedUnits === totalOrderedUnits &&
                      totalOrderedUnits > 0 && (
                        <p className="flex items-center gap-2 text-[14px] font-bold text-[var(--rt-teal-ink)]">
                          <CheckCircle size={18} weight="fill" />
                          Counter is clear! Drag any item out of a basket to
                          reassign it.
                        </p>
                      )}
                  </div>
                </div>

                {/* Player Basket Drop Zones */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedPlayerIds.map((pid) => {
                    const p = players.find((x) => x.id === pid)
                    const share = splitEval.result?.shares.find(
                      (s) => s.billPlayerId === pid
                    )
                    const isOver = dropTarget === pid
                    const basketItems = items
                      .map((item, idx) => ({
                        item,
                        idx,
                        qty: allocMap[`${item.id}::${pid}`] ?? 0,
                      }))
                      .filter((x) => x.qty > 0)

                    return (
                      <div
                        key={pid}
                        onDragOver={(e) => {
                          if (!dragPayload || dragPayload.from === pid) return
                          e.preventDefault()
                          setDropTarget(pid)
                        }}
                        onDragLeave={() =>
                          setDropTarget((curr) => (curr === pid ? null : curr))
                        }
                        onDrop={(e) => {
                          e.preventDefault()
                          if (dragPayload && dragPayload.from !== pid) {
                            moveUnit(dragPayload.itemId, dragPayload.from, pid)
                          }
                          setDragPayload(null)
                          setDropTarget(null)
                        }}
                        className={`flex min-h-[168px] flex-col rounded border-2 p-3.5 transition-colors ${
                          isOver
                            ? "border-[var(--rt-accent)] bg-[var(--rt-accent-soft)] ring-2 ring-[var(--rt-accent)]/30"
                            : "border-[var(--rt-border)] bg-[var(--rt-surface-alt)]"
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-[var(--rt-border-soft)] pb-2">
                          <div className="flex items-center gap-2">
                            {p && <PlayerAvatar player={p} size="sm" />}
                            <span className="text-[16px] font-bold">
                              {p?.name}
                            </span>
                          </div>
                          {share && (
                            <span className="tnum font-arcade-mono text-[15px] font-bold text-[var(--rt-teal-ink)]">
                              {formatRupiah(share.total)}
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 flex-1 space-y-2">
                          {basketItems.length === 0 ? (
                            <p className="py-5 text-center text-[13px] font-semibold text-[var(--rt-muted)]">
                              {isOver
                                ? `Drop item into ${p?.name}'s basket`
                                : "Drop items here"}
                            </p>
                          ) : (
                            basketItems.map(({ item, idx, qty }) => {
                              const ordered = itemUnits(
                                item.quantity,
                                item.bundleSize
                              )
                              const canAdd = assignedForItem(item.id) < ordered
                              const tint = ITEM_TINTS[idx % ITEM_TINTS.length]
                              const unitCost = Math.round(
                                (item.quantity * item.unitPrice) / ordered
                              )
                              const itemCost = unitCost * qty
                              return (
                                <div
                                  key={item.id}
                                  draggable
                                  onDragStart={() =>
                                    setDragPayload({
                                      itemId: item.id,
                                      from: pid,
                                    })
                                  }
                                  onDragEnd={() => {
                                    setDragPayload(null)
                                    setDropTarget(null)
                                  }}
                                  className={`group relative flex cursor-grab items-center justify-between gap-2 rounded border border-[var(--rt-ui-border)] border-l-4 ${tint} bg-[var(--rt-surface)] px-2.5 py-2 text-[14px] active:cursor-grabbing`}
                                >
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <DotsSixVertical
                                      size={14}
                                      weight="bold"
                                      className="shrink-0 text-[var(--rt-muted)]"
                                    />
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold">
                                        {item.name || "Unnamed item"}
                                      </p>
                                      <p className="tnum font-arcade-mono text-[12px] text-[var(--rt-muted)]">
                                        {formatRupiah(itemCost)}
                                        {item.variantNotes ? " · hover for note" : ""}
                                      </p>
                                    </div>
                                  </div>

                                  {item.variantNotes && (
                                    <div
                                      role="tooltip"
                                      className="pointer-events-none absolute -top-9 left-3 z-30 hidden max-w-[240px] truncate rounded bg-[var(--rt-tip-bg)] px-2.5 py-1 text-[12px] font-semibold text-[var(--rt-tip-ink)] shadow-lg group-hover:block"
                                    >
                                      {item.variantNotes}
                                    </div>
                                  )}

                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      aria-label={`Remove ${item.name} from ${p?.name}`}
                                      onClick={() => stepAlloc(item, pid, -1)}
                                      className="rt2-focus rt2-btn-secondary inline-flex h-7 w-7 items-center justify-center rounded"
                                    >
                                      <Minus size={12} weight="bold" />
                                    </button>
                                    <span className="tnum w-5 text-center font-arcade-mono text-[13px] font-bold">
                                      {qty}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={!canAdd}
                                      aria-label={`Add ${item.name} to ${p?.name}`}
                                      onClick={() => stepAlloc(item, pid, 1)}
                                      className="rt2-focus rt2-btn-secondary inline-flex h-7 w-7 items-center justify-center rounded"
                                    >
                                      <Plus size={12} weight="bold" />
                                    </button>
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Wizard Footer Nav */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[var(--rt-border)] pt-4">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => goToStep(step - 1)}
              className="rt2-focus rt2-btn-secondary inline-flex min-h-[44px] items-center gap-1.5 rounded px-4 text-[15px] font-bold"
            >
              <ArrowLeft size={16} weight="bold" />
              Back
            </button>

            {step < BILL_STEPS.length - 1 ? (
              <button
                type="button"
                disabled={merchantMissing}
                onClick={() => goToStep(step + 1)}
                className="rt2-focus rt2-btn-primary inline-flex min-h-[44px] items-center gap-1.5 rounded px-5 text-[15px] font-bold"
              >
                Next: {BILL_STEPS[step + 1].title}
                <ArrowRight size={16} weight="bold" />
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!splitEval.result}
                  onClick={() => void handlePublish(true)}
                  className="rt2-focus rt2-btn-secondary inline-flex min-h-[44px] items-center gap-1.5 rounded px-4 text-[15px] font-bold"
                >
                  <FloppyDisk size={16} weight="bold" />
                  Save draft
                </button>
                <button
                  type="button"
                  disabled={!splitEval.result}
                  onClick={() => setConfirmPublishOpen(true)}
                  className="rt2-focus rt2-btn-primary inline-flex min-h-[44px] items-center gap-1.5 rounded px-5 text-[15px] font-bold"
                >
                  <PaperPlaneTilt size={16} weight="bold" />
                  Publish bill
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right 4 Cols: Sticky Live Split Preview */}
        <aside className="lg:col-span-4">
          <div className="space-y-4 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5 lg:sticky lg:top-20">
            <div className="flex items-center justify-between border-b border-[var(--rt-border-soft)] pb-3">
              <h2 className="rt2-display text-2xl font-extrabold">
                Live Split Preview
              </h2>
              {splitEval.result ? (
                <span className="inline-flex items-center gap-1 rounded bg-[var(--rt-teal-soft)] px-2 py-0.5 font-arcade-mono text-[13px] font-bold text-[var(--rt-teal-ink)]">
                  <CheckCircle size={15} weight="bold" />
                  Balanced
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-[var(--rt-accent-soft)] px-2 py-0.5 font-arcade-mono text-[13px] font-bold text-[var(--rt-accent-ink)]">
                  <WarningCircle size={15} weight="bold" />
                  Needs fix
                </span>
              )}
            </div>

            <div className="space-y-1.5 font-arcade-mono text-[14px]">
              <div className="flex justify-between">
                <span className="text-[var(--rt-muted)]">Items subtotal</span>
                <span className="tnum font-bold">
                  {formatRupiah(itemSubtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--rt-muted)]">Adjustments</span>
                <span className="tnum font-bold text-[var(--rt-teal-ink)]">
                  {adjustmentsTotal >= 0
                    ? `+${formatRupiah(adjustmentsTotal)}`
                    : `-${formatRupiah(Math.abs(adjustmentsTotal))}`}
                </span>
              </div>
              <div className="flex justify-between border-t border-[var(--rt-border-soft)] pt-2 text-[16px]">
                <span className="font-bold">Grand total</span>
                <span className="tnum font-extrabold">
                  {formatRupiah(finalTotal)}
                </span>
              </div>
            </div>

            {splitEval.issues.length > 0 ? (
              <div className="rounded border-2 border-[var(--rt-accent)] bg-[var(--rt-accent-soft)] p-3 text-[13px] text-[var(--rt-accent-ink)]">
                <p className="font-bold">Fix before publishing:</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  {splitEval.issues.map((iss, idx) => (
                    <li key={`${iss.code}-${idx}`}>{describeIssue(iss)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="divide-y divide-[var(--rt-border-soft)] rounded border border-[var(--rt-ui-border)] bg-[var(--rt-bg)]">
                {splitEval.result?.shares.map((share) => {
                  const p = players.find((x) => x.id === share.billPlayerId)
                  const isRounding = share.billPlayerId === roundingPlayerId
                  return (
                    <div
                      key={share.billPlayerId}
                      className="flex items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[15px] font-bold">
                          {p?.name ?? share.billPlayerId}
                          {isRounding && (
                            <span className="rounded bg-[var(--rt-surface-alt)] px-1.5 py-0.5 font-arcade-mono text-[11px] font-semibold text-[var(--rt-muted)]">
                              rounding
                            </span>
                          )}
                        </p>
                        <p className="tnum font-arcade-mono text-[12px] text-[var(--rt-muted)]">
                          Items {formatRupiah(share.itemSubtotal)}
                        </p>
                      </div>
                      <span className="tnum font-arcade-mono text-[16px] font-bold">
                        {formatRupiah(share.total)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={!splitEval.result}
                onClick={() => setConfirmPublishOpen(true)}
                className="rt2-focus rt2-btn-primary inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded px-4 text-[15px] font-bold"
              >
                <PaperPlaneTilt size={17} weight="bold" />
                Publish bill
              </button>
              <button
                type="button"
                disabled={!splitEval.result}
                onClick={() => void handlePublish(true)}
                className="rt2-focus rt2-btn-secondary inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded px-4 text-[14px] font-bold"
              >
                <FloppyDisk size={16} weight="bold" />
                Save as draft
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Publish Confirmation Dialog with full split & receipt details */}
      <Dialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Confirm &amp; Publish Bill</DialogTitle>
            <DialogDescription>
              Review the final totals and player splits before publishing to the
              live board.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-bg)] p-3.5 text-[14px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[16px] font-bold">
                  {merchant.trim() || "Untitled Bill"}
                </span>
                <span className="font-arcade-mono text-[13px] text-[var(--rt-muted)]">
                  {fmtDate(orderDate, { includeYear: true })}
                </span>
              </div>
              {title.trim() && (
                <p className="mt-0.5 text-[13px] text-[var(--rt-muted)]">
                  {title}
                </p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-2 font-arcade-mono text-[12px]">
                <span className="rounded bg-[var(--rt-surface)] px-2 py-0.5 font-bold">
                  {items.length} {items.length === 1 ? "item" : "items"}
                </span>
                <span className="rounded bg-[var(--rt-surface)] px-2 py-0.5 font-bold">
                  {censorBoxes.filter((b) => b.enabled).length} censor boxes
                </span>
                {receiptCrop && (
                  <span className="rounded bg-[var(--rt-teal-soft)] px-2 py-0.5 font-bold text-[var(--rt-teal-ink)]">
                    Cropped
                  </span>
                )}
              </div>
            </div>

            <div className="divide-y divide-[var(--rt-border-soft)] rounded border border-[var(--rt-ui-border)] bg-[var(--rt-bg)]">
              {splitEval.result?.shares.map((share) => {
                const p = players.find((x) => x.id === share.billPlayerId)
                const isRounding = share.billPlayerId === roundingPlayerId
                return (
                  <div
                    key={share.billPlayerId}
                    className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[14px]"
                  >
                    <span className="flex items-center gap-2 font-bold">
                      {p && <PlayerAvatar player={p} size="sm" />}
                      <span>
                        {p?.name ?? share.billPlayerId}
                        {isRounding && (
                          <span className="ml-1.5 rounded bg-[var(--rt-surface)] px-1.5 py-0.5 font-arcade-mono text-[11px] text-[var(--rt-muted)]">
                            rounding
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="tnum font-arcade-mono text-[15px] font-bold">
                      {formatRupiah(share.total)}
                    </span>
                  </div>
                )
              })}
              <div className="flex items-center justify-between bg-[var(--rt-surface-alt)] px-3.5 py-2.5 font-arcade-mono text-[15px] font-extrabold">
                <span>Grand total</span>
                <span className="tnum">{formatRupiah(finalTotal)}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--rt-border-soft)] pt-3">
              <DialogClose className="rt2-focus rt2-btn-secondary min-h-[42px] rounded px-4 text-[14px] font-bold">
                Back to edit
              </DialogClose>
              <button
                type="button"
                onClick={() => {
                  setConfirmPublishOpen(false)
                  void handlePublish(false)
                }}
                className="rt2-focus rt2-btn-primary inline-flex min-h-[42px] items-center gap-1.5 rounded px-4 text-[14px] font-bold"
              >
                <PaperPlaneTilt size={15} weight="bold" />
                Confirm &amp; Publish
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unsaved-changes confirmation before leaving New Bill */}
      <Dialog
        open={leaveBlocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && leaveBlocker.status === "blocked") {
            leaveBlocker.reset()
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unsaved bill?</DialogTitle>
            <DialogDescription>
              Leaving this tab will clear your receipt, items, and split
              progress for this bill.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (leaveBlocker.status === "blocked") leaveBlocker.reset()
              }}
              className="rt2-focus rt2-btn-secondary min-h-[42px] rounded px-4 text-[14px] font-bold"
            >
              Stay on New Bill
            </button>
            <button
              type="button"
              onClick={() => {
                if (leaveBlocker.status === "blocked") leaveBlocker.proceed()
              }}
              className="rt2-focus rt2-btn-danger min-h-[42px] rounded px-4 text-[14px] font-bold"
            >
              Discard &amp; leave
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
