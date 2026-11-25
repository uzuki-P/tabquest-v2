import {
  ArrowCounterClockwise,
  Check,
  Crop,
  EyeSlash,
  Rectangle,
  Trash,
  X,
} from "@phosphor-icons/react"
import { useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"

import { formatRupiah } from "@/domain/money"

export interface CensorBox {
  id: string
  label: string
  /** Normalized 0..1 coordinates relative to the canvas */
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

type Tool = "censor" | "crop"

type DragState =
  | {
      kind: "draw"
      tool: Tool
      startX: number
      startY: number
      currX: number
      currY: number
    }
  | {
      kind: "move"
      id: string
      startX: number
      startY: number
      origX: number
      origY: number
    }
  | {
      kind: "resize"
      id: string
      startX: number
      startY: number
      origW: number
      origH: number
    }

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
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
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [tool, setTool] = useState<Tool>("censor")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [draftCrop, setDraftCrop] = useState<CropRect | null>(crop)
  const [history, setHistory] = useState<CensorBox[][]>([])

  const pushHistory = (snapshot: CensorBox[]) => {
    setHistory((prev) => [...prev.slice(-14), snapshot])
  }

  const undo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    onChange(prev)
  }

  const toNormalized = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    }
  }

  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = toNormalized(e.clientX, e.clientY)
    setSelectedId(null)
    setDrag({
      kind: "draw",
      tool,
      startX: pt.x,
      startY: pt.y,
      currX: pt.x,
      currY: pt.y,
    })
  }

  const onBoxPointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    box: CensorBox
  ) => {
    if (tool !== "censor") return
    e.stopPropagation()
    if (e.button !== 0) return
    canvasRef.current?.setPointerCapture(e.pointerId)
    const pt = toNormalized(e.clientX, e.clientY)
    setSelectedId(box.id)
    pushHistory(boxes)
    setDrag({
      kind: "move",
      id: box.id,
      startX: pt.x,
      startY: pt.y,
      origX: box.x,
      origY: box.y,
    })
  }

  const onResizePointerDown = (
    e: ReactPointerEvent<HTMLSpanElement>,
    box: CensorBox
  ) => {
    if (tool !== "censor") return
    e.stopPropagation()
    if (e.button !== 0) return
    canvasRef.current?.setPointerCapture(e.pointerId)
    const pt = toNormalized(e.clientX, e.clientY)
    setSelectedId(box.id)
    pushHistory(boxes)
    setDrag({
      kind: "resize",
      id: box.id,
      startX: pt.x,
      startY: pt.y,
      origW: box.w,
      origH: box.h,
    })
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return
    const pt = toNormalized(e.clientX, e.clientY)
    if (drag.kind === "draw") {
      setDrag({ ...drag, currX: pt.x, currY: pt.y })
      return
    }
    if (drag.kind === "move") {
      const dx = pt.x - drag.startX
      const dy = pt.y - drag.startY
      onChange(
        boxes.map((b) =>
          b.id === drag.id
            ? {
                ...b,
                x: Math.max(0, Math.min(1 - b.w, drag.origX + dx)),
                y: Math.max(0, Math.min(1 - b.h, drag.origY + dy)),
              }
            : b
        )
      )
      return
    }
    if (drag.kind === "resize") {
      const dx = pt.x - drag.startX
      const dy = pt.y - drag.startY
      onChange(
        boxes.map((b) =>
          b.id === drag.id
            ? {
                ...b,
                w: Math.max(0.06, Math.min(1 - b.x, drag.origW + dx)),
                h: Math.max(0.05, Math.min(1 - b.y, drag.origH + dy)),
              }
            : b
        )
      )
    }
  }

  const onPointerUp = () => {
    if (!drag) return
    if (drag.kind === "draw") {
      const x = Math.min(drag.startX, drag.currX)
      const y = Math.min(drag.startY, drag.currY)
      const w = Math.abs(drag.currX - drag.startX)
      const h = Math.abs(drag.currY - drag.startY)
      if (w >= 0.04 && h >= 0.03) {
        if (drag.tool === "censor") {
          pushHistory(boxes)
          const manualCount = boxes.filter((b) => !b.suggested).length + 1
          const created: CensorBox = {
            id: `censor-${Date.now()}`,
            label: `Manual censor #${manualCount}`,
            x,
            y,
            w,
            h,
            enabled: true,
          }
          onChange([...boxes, created])
          setSelectedId(created.id)
        } else {
          setDraftCrop({ x, y, w, h })
        }
      }
    }
    setDrag(null)
  }

  const removeBox = (id: string) => {
    pushHistory(boxes)
    onChange(boxes.filter((b) => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const toggleBox = (id: string) => {
    pushHistory(boxes)
    onChange(boxes.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)))
  }

  const activeCount = boxes.filter((b) => b.enabled).length

  const previewDrawBox =
    drag?.kind === "draw"
      ? {
          tool: drag.tool,
          x: Math.min(drag.startX, drag.currX),
          y: Math.min(drag.startY, drag.currY),
          w: Math.abs(drag.currX - drag.startX),
          h: Math.abs(drag.currY - drag.startY),
        }
      : null

  const activeCropBox =
    previewDrawBox?.tool === "crop" ? previewDrawBox : draftCrop ?? crop

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-12">
      {/* Interactive Censor & Crop Canvas */}
      <div className="space-y-2 md:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
          {/* Tool Switcher: Censor | Crop */}
          <div className="inline-flex rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-bg)] p-0.5">
            <button
              type="button"
              aria-pressed={tool === "censor"}
              onClick={() => setTool("censor")}
              className={`rt2-focus inline-flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-xs px-2.5 text-[12px] font-bold transition ${
                tool === "censor"
                  ? "bg-[var(--rt-ink)] text-[var(--rt-surface)]"
                  : "text-[var(--rt-muted)] hover:text-[var(--rt-ink)]"
              }`}
            >
              <Rectangle size={13} weight="bold" />
              Censor
            </button>
            <button
              type="button"
              aria-pressed={tool === "crop"}
              onClick={() => setTool("crop")}
              className={`rt2-focus inline-flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-xs px-2.5 text-[12px] font-bold transition ${
                tool === "crop"
                  ? "bg-[var(--rt-ink)] text-[var(--rt-surface)]"
                  : "text-[var(--rt-muted)] hover:text-[var(--rt-ink)]"
              }`}
            >
              <Crop size={13} weight="bold" />
              Crop
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {tool === "crop" && draftCrop && (
              <button
                type="button"
                onClick={() => {
                  onCropChange(draftCrop)
                  setTool("censor")
                }}
                className="rt2-focus rt2-btn-primary inline-flex min-h-[32px] items-center gap-1 rounded px-2.5 text-[12px] font-bold"
              >
                <Check size={13} weight="bold" />
                Apply crop
              </button>
            )}
            {(crop || draftCrop) && (
              <button
                type="button"
                onClick={() => {
                  setDraftCrop(null)
                  onCropChange(null)
                }}
                className="rt2-focus rt2-btn-secondary inline-flex min-h-[32px] items-center gap-1 rounded px-2.5 text-[12px] font-bold"
              >
                Reset crop
              </button>
            )}
            <button
              type="button"
              disabled={history.length === 0}
              onClick={undo}
              className="rt2-focus rt2-btn-secondary inline-flex min-h-[32px] items-center gap-1 rounded px-2.5 text-[12px] font-bold"
            >
              <ArrowCounterClockwise size={13} weight="bold" />
              Undo
            </button>
          </div>
        </div>

        <div
          ref={canvasRef}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative h-64 cursor-crosshair touch-none select-none overflow-hidden rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface-alt)]"
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Uploaded receipt preview"
              draggable={false}
              className="pointer-events-none h-full w-full object-contain"
            />
          ) : (
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
          )}

          {/* Active Censor Boxes */}
          {boxes
            .filter((b) => b.enabled)
            .map((box) => {
              const isSelected = box.id === selectedId
              return (
                <div
                  key={box.id}
                  onPointerDown={(e) => onBoxPointerDown(e, box)}
                  style={{
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.w * 100}%`,
                    height: `${box.h * 100}%`,
                  }}
                  className={`group absolute flex items-center justify-center rounded-sm bg-[#12161B] text-[10px] font-bold tracking-wider text-white uppercase shadow ${
                    tool === "censor" ? "cursor-move" : "pointer-events-none"
                  } ${
                    isSelected
                      ? "ring-2 ring-[var(--rt-accent)] ring-offset-1"
                      : "hover:ring-2 hover:ring-white/80"
                  }`}
                >
                  <span className="pointer-events-none truncate px-1">
                    REDACTED
                  </span>

                  {tool === "censor" && (
                    <>
                      <button
                        type="button"
                        aria-label={`Remove ${box.label}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          removeBox(box.id)
                        }}
                        className="absolute -top-2 -right-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-white bg-[var(--rt-accent)] text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      >
                        <X size={10} weight="bold" />
                      </button>

                      <span
                        aria-hidden="true"
                        onPointerDown={(e) => onResizePointerDown(e, box)}
                        className="absolute -right-1.5 -bottom-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-xs border-2 border-[var(--rt-accent)] bg-white"
                      />
                    </>
                  )}
                </div>
              )
            })}

          {/* Crop Overlay Frame (darkens outside cropped region) */}
          {activeCropBox && (
            <div
              style={{
                left: `${activeCropBox.x * 100}%`,
                top: `${activeCropBox.y * 100}%`,
                width: `${activeCropBox.w * 100}%`,
                height: `${activeCropBox.h * 100}%`,
                boxShadow: "0 0 0 9999px rgba(11, 14, 18, 0.62)",
              }}
              className="pointer-events-none absolute z-20 border-2 border-dashed border-[var(--rt-teal)]"
            >
              <span className="absolute top-1 left-1 rounded-xs bg-[var(--rt-teal)] px-1.5 py-0.5 font-arcade-mono text-[10px] font-bold text-white">
                CROP {Math.round(activeCropBox.w * 100)}% x{" "}
                {Math.round(activeCropBox.h * 100)}%
              </span>
            </div>
          )}

          {/* Live Censor drawing marquee */}
          {previewDrawBox?.tool === "censor" && (
            <div
              style={{
                left: `${previewDrawBox.x * 100}%`,
                top: `${previewDrawBox.y * 100}%`,
                width: `${previewDrawBox.w * 100}%`,
                height: `${previewDrawBox.h * 100}%`,
              }}
              className="pointer-events-none absolute z-30 border-2 border-dashed border-[var(--rt-accent)] bg-[#12161B]/70"
            />
          )}
        </div>
        <p className="text-[12px] text-[var(--rt-muted)]">
          {tool === "crop"
            ? "Drag on the receipt to choose the area to keep, then click Apply crop."
            : "Drag to draw a black censor box. Drag a box to move it, or its corner square to resize."}
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
          <div className="rt2-scroll-fade-y mt-2 max-h-56 space-y-2 overflow-y-auto py-2">
            {boxes.length === 0 ? (
              <p className="rounded border border-dashed border-[var(--rt-ui-border)] p-3 text-[13px] text-[var(--rt-muted)]">
                No censor boxes yet. Drag anywhere on the receipt to black out
                private info.
              </p>
            ) : (
              boxes.map((b) => (
                <div
                  key={b.id}
                  className={`flex min-h-[38px] items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-[13px] font-semibold ${
                    b.id === selectedId
                      ? "border-[var(--rt-accent)] bg-[var(--rt-accent-soft)]"
                      : "border-[var(--rt-ui-border)] bg-[var(--rt-bg)]"
                  }`}
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
          </div>
        </div>
      </div>
    </div>
  )
}
