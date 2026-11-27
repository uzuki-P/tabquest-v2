import {
  ArrowsOutSimple,
  Crop,
  EyeSlash,
  Trash,
} from "@phosphor-icons/react"
import { useRef, useState } from "react"
import type { DragEvent as ReactDragEvent } from "react"

import { ReceiptImageEditorDialog } from "@/components/admin/ReceiptImageEditorDialog"
import { ScrollFade } from "@/components/telemetry/ScrollFade"
import { formatRupiah } from "@/domain/money"
import type { ImageEdits } from "@/lib/image-edits"

export interface CensorBox {
  id: string
  label: string
  /** Normalized 0..1 coordinates relative to the image */
  x: number
  y: number
  w: number
  h: number
  enabled: boolean
  suggested?: boolean
}

export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

export function ReceiptRedactor({
  imageUrl,
  merchant,
  orderDate,
  items,
  finalTotal,
  boxes,
  onChange,
  crop,
  onCropChange,
  onPickFile,
}: {
  imageUrl: string | null
  merchant: string
  orderDate: string
  items: Array<{ id: string; name: string; quantity: number; unitPrice: number }>
  finalTotal: number
  boxes: CensorBox[]
  onChange: (next: CensorBox[]) => void
  crop: CropRect | null
  onCropChange: (next: CropRect | null) => void
  onPickFile?: (file: File) => void
}) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const dragDepthRef = useRef(0)

  const carriesFiles = (event: ReactDragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files")

  const dropHandlers = onPickFile
    ? {
        onDragEnter(event: ReactDragEvent) {
          if (!carriesFiles(event)) return
          event.preventDefault()
          dragDepthRef.current += 1
          setDragOver(true)
        },
        onDragOver(event: ReactDragEvent) {
          if (!carriesFiles(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
        },
        onDragLeave(event: ReactDragEvent) {
          if (!carriesFiles(event)) return
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
          if (dragDepthRef.current === 0) setDragOver(false)
        },
        onDrop(event: ReactDragEvent) {
          if (!carriesFiles(event)) return
          event.preventDefault()
          dragDepthRef.current = 0
          setDragOver(false)
          const file = Array.from(event.dataTransfer.files).at(0)
          if (!file) return
          if (!file.type.startsWith("image/")) {
            setDropError(
              `${file.name} is not an image. Drop a PNG, JPEG, WebP, or AVIF file.`
            )
            return
          }
          setDropError(null)
          onPickFile(file)
        },
      }
    : {}

  const removeBox = (id: string) => {
    onChange(boxes.filter((b) => b.id !== id))
  }

  const toggleBox = (id: string) => {
    onChange(boxes.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)))
  }

  const activeBoxes = boxes.filter((b) => b.enabled)
  const activeCount = activeBoxes.length

  const initialEdits: ImageEdits = {
    boxes: activeBoxes.map((b) => ({
      x: b.x,
      y: b.y,
      width: b.w,
      height: b.h,
      label: b.label,
    })),
    crop: crop
      ? {
          x: crop.x,
          y: crop.y,
          width: crop.w,
          height: crop.h,
        }
      : null,
  }

  const handleApplyEdits = (nextEdits: ImageEdits) => {
    const disabledBoxes = boxes.filter((b) => !b.enabled)
    let manualCounter = 0
    const nextEnabled: CensorBox[] = nextEdits.boxes.map((box, idx) => {
      const label =
        box.label && box.label.trim().length > 0
          ? box.label
          : `Manual censor #${++manualCounter}`
      const existing = activeBoxes[idx]
      return {
        id: existing?.id ?? `censor-${Date.now()}-${idx}`,
        label,
        x: box.x,
        y: box.y,
        w: box.width,
        h: box.height,
        enabled: true,
        suggested: existing?.suggested,
      }
    })
    onChange([...nextEnabled, ...disabledBoxes])
    onCropChange(
      nextEdits.crop
        ? {
            x: nextEdits.crop.x,
            y: nextEdits.crop.y,
            w: nextEdits.crop.width,
            h: nextEdits.crop.height,
          }
        : null
    )
    setEditorOpen(false)
  }

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-12">
      {/* Receipt Preview & Fullscreen Editor Trigger */}
      <div className="space-y-2 md:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <button
            type="button"
            disabled={!imageUrl}
            onClick={() => setEditorOpen(true)}
            className="rt2-focus rt2-btn-secondary inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded px-3 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Crop size={14} weight="bold" />
            Crop &amp; censor
          </button>

          {crop && (
            <button
              type="button"
              onClick={() => onCropChange(null)}
              className="rt2-focus rt2-btn-secondary inline-flex min-h-[32px] cursor-pointer items-center gap-1 rounded px-2.5 text-[12px] font-bold"
            >
              Reset crop
            </button>
          )}
        </div>

        <div className="relative" {...dropHandlers}>
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded border-2 border-dashed border-[var(--rt-accent)] bg-[var(--rt-accent)]/15 text-[14px] font-bold text-[var(--rt-accent-ink)] backdrop-blur-[1px]">
              {imageUrl
                ? "Drop to replace the receipt photo"
                : "Drop the receipt photo here"}
            </div>
          )}

          {imageUrl ? (
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              title="Open fullscreen crop & censor editor"
              className="rt2-focus group relative flex h-80 w-full cursor-pointer items-center justify-center overflow-hidden rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface-alt)] p-2 md:h-96"
            >
              <div className="relative inline-flex max-h-full max-w-full overflow-hidden">
                <img
                  src={imageUrl}
                  alt="Uploaded receipt preview"
                  draggable={false}
                  className="pointer-events-none block max-h-[calc(20rem-1rem)] max-w-full object-contain md:max-h-[calc(24rem-1rem)]"
                />

                {/* Active Censor Boxes */}
                {activeBoxes.map((box) => (
                  <div
                    key={box.id}
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.w * 100}%`,
                      height: `${box.h * 100}%`,
                    }}
                    className="pointer-events-none absolute bg-[#12161B]"
                  />
                ))}

                {/* Crop Overlay Frame */}
                {crop && (
                  <div
                    style={{
                      left: `${crop.x * 100}%`,
                      top: `${crop.y * 100}%`,
                      width: `${crop.w * 100}%`,
                      height: `${crop.h * 100}%`,
                      boxShadow: "0 0 0 9999px rgba(11, 14, 18, 0.62)",
                    }}
                    className="pointer-events-none absolute z-10 border-2 border-dashed border-[var(--rt-teal)]"
                  />
                )}
              </div>

              <span className="pointer-events-none absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded border border-white/30 bg-black/75 px-2.5 py-1 text-[12px] font-bold text-white shadow transition group-hover:bg-[var(--rt-accent)]">
                <ArrowsOutSimple size={13} weight="bold" />
                Open fullscreen editor
              </span>
            </button>
          ) : (
            <div className="relative h-64 overflow-hidden rounded border-2 border-dashed border-[var(--rt-border)] bg-[var(--rt-surface-alt)]">
              <div className="pointer-events-none p-4 font-arcade-mono text-[12px]">
                <p className="font-bold text-[var(--rt-ink)]">
                  {merchant || "MERCHANT RECEIPT"}
                </p>
                <p className="mt-1 text-[var(--rt-muted)]">
                  Date: {orderDate} | Order #GF-982144
                </p>
                <p className="mt-1 text-[var(--rt-muted)]">
                  Tel: 0812-9918-4402 (Pajar)
                </p>
                <div className="my-2.5 border-y border-dashed border-[var(--rt-ui-border)] py-2">
                  {items.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {item.quantity}x {item.name || "Item"}
                      </span>
                      <span className="tnum shrink-0">
                        {formatRupiah(item.quantity * item.unitPrice)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-bold">
                  <span>TOTAL</span>
                  <span className="tnum">{formatRupiah(finalTotal)}</span>
                </div>
                <p className="mt-5 text-[11px] text-[var(--rt-muted)]">
                  Driver: Agus Santoso (B 4129 KXY)
                </p>
              </div>
            </div>
          )}
        </div>

        {dropError && (
          <p role="alert" className="text-[12px] font-semibold text-[var(--rt-accent-ink)]">
            {dropError}
          </p>
        )}

        <p className="text-[12px] text-[var(--rt-muted)]">
          {imageUrl
            ? "Click the receipt or press Crop & censor to open the fullscreen editor, or drop a new photo to replace it."
            : "Choose or drag and drop a receipt image here to crop or black out private info in the fullscreen editor."}
        </p>
      </div>

      {/* Right list of masks */}
      <div className="flex flex-col justify-between gap-3 md:col-span-5">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-bold">
              Censor boxes ({activeCount} active)
            </p>
            {crop && (
              <span className="rounded bg-[var(--rt-teal-soft)] px-1.5 py-0.5 font-arcade-mono text-[11px] font-bold text-[var(--rt-teal-ink)]">
                Cropped
              </span>
            )}
          </div>
          <ScrollFade className="mt-2 max-h-72 space-y-2 py-2">
            {boxes.length === 0 ? (
              <p className="rounded border border-dashed border-[var(--rt-ui-border)] p-3 text-[13px] text-[var(--rt-muted)]">
                No censor boxes yet. Open the fullscreen editor to black out
                private info or crop the receipt.
              </p>
            ) : (
              boxes.map((b) => (
                <div
                  key={b.id}
                  className="flex min-h-[38px] items-center justify-between gap-2 rounded border border-[var(--rt-ui-border)] bg-[var(--rt-bg)] px-2.5 py-1.5 text-[13px] font-semibold"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={b.enabled}
                      onChange={() => toggleBox(b.id)}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--rt-accent)]"
                    />
                    <EyeSlash size={14} weight="bold" className="shrink-0" />
                    <span className="truncate">{b.label}</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Delete ${b.label}`}
                    onClick={() => removeBox(b.id)}
                    className="rt2-focus inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--rt-muted)] hover:bg-[var(--rt-surface-alt)] hover:text-[var(--rt-accent-ink)]"
                  >
                    <Trash size={14} weight="bold" />
                  </button>
                </div>
              ))
            )}
          </ScrollFade>
        </div>
      </div>

      {editorOpen && imageUrl && (
        <ReceiptImageEditorDialog
          src={imageUrl}
          initialEdits={initialEdits}
          title="Crop & censor receipt"
          onCancel={() => setEditorOpen(false)}
          onApply={handleApplyEdits}
        />
      )}
    </div>
  )
}
