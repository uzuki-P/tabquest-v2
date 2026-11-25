import {
  ArrowCounterClockwise,
  Camera,
  Check,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react"

import { PlayerAvatar } from "@/components/telemetry/components"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PlayerSummary } from "@/domain/types"

const CROP_VIEW_SIZE = 240
const EXPORT_SIZE = 256

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function AvatarUploadDialog({
  open,
  onOpenChange,
  player,
  onSave,
  onRemove,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  player: Pick<PlayerSummary, "id" | "name" | "avatar" | "avatarUrl" | "avatarBanned">
  onSave: (blob: Blob) => void | Promise<void>
  onRemove?: () => void | Promise<void>
}) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [origSizeBytes, setOrigSizeBytes] = useState<number>(0)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null
  )
  const [zoom, setZoom] = useState<number>(1)
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [compressedPreview, setCompressedPreview] = useState<{
    dataUrl: string
    bytes: number
    mime: string
  } | null>(null)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  useEffect(() => {
    if (!open) {
      if (srcUrl) URL.revokeObjectURL(srcUrl)
      setSrcUrl(null)
      setNaturalSize(null)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setCompressedPreview(null)
      setOrigSizeBytes(0)
      setIsDraggingFile(false)
    }
  }, [open])

  const clampOffset = (
    x: number,
    y: number,
    z: number,
    nat: { w: number; h: number } | null
  ) => {
    if (!nat) return { x: 0, y: 0 }
    const baseScale = Math.max(CROP_VIEW_SIZE / nat.w, CROP_VIEW_SIZE / nat.h)
    const dispW = nat.w * baseScale * z
    const dispH = nat.h * baseScale * z
    const maxX = Math.max(0, (dispW - CROP_VIEW_SIZE) / 2)
    const maxY = Math.max(0, (dispH - CROP_VIEW_SIZE) / 2)
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    }
  }

  // Re-render compressed 256x256 output whenever crop/zoom/image changes
  useEffect(() => {
    const img = imgRef.current
    if (!img || !naturalSize || !srcUrl) return

    const canvas = document.createElement("canvas")
    canvas.width = EXPORT_SIZE
    canvas.height = EXPORT_SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const baseScale = Math.max(
      CROP_VIEW_SIZE / naturalSize.w,
      CROP_VIEW_SIZE / naturalSize.h
    )
    const scale = baseScale * zoom
    const ratio = EXPORT_SIZE / CROP_VIEW_SIZE
    const drawW = naturalSize.w * scale * ratio
    const drawH = naturalSize.h * scale * ratio
    const drawX = (EXPORT_SIZE - drawW) / 2 + offset.x * ratio
    const drawY = (EXPORT_SIZE - drawH) / 2 + offset.y * ratio

    ctx.fillStyle = "#12161B"
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
    ctx.drawImage(img, drawX, drawY, drawW, drawH)

    let dataUrl = canvas.toDataURL("image/webp", 0.82)
    let mime = "WebP"
    if (!dataUrl.startsWith("data:image/webp")) {
      dataUrl = canvas.toDataURL("image/jpeg", 0.82)
      mime = "JPEG"
    }
    const base64Len = dataUrl.split(",")[1]?.length ?? 0
    const approxBytes = Math.round((base64Len * 3) / 4)
    setCompressedPreview({ dataUrl, bytes: approxBytes, mime })
  }, [srcUrl, naturalSize, zoom, offset])

  const handleFilePick = (file: File) => {
    if (!file.type.startsWith("image/")) return
    if (srcUrl) URL.revokeObjectURL(srcUrl)
    const nextUrl = URL.createObjectURL(file)
    setSrcUrl(nextUrl)
    setOrigSizeBytes(file.size)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }

  const onDropFile = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFile(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFilePick(file)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!naturalSize) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setOffset(
      clampOffset(
        dragRef.current.origX + dx,
        dragRef.current.origY + dy,
        zoom,
        naturalSize
      )
    )
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  const baseScale = naturalSize
    ? Math.max(CROP_VIEW_SIZE / naturalSize.w, CROP_VIEW_SIZE / naturalSize.h)
    : 1

  const savedPct =
    compressedPreview && origSizeBytes > 0
      ? Math.max(
          0,
          Math.round((1 - compressedPreview.bytes / origSizeBytes) * 100)
        )
      : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFilePick(file)
            e.target.value = ""
          }}
        />

        <div className="flex items-start justify-between gap-3 border-b border-[var(--rt-border-soft)] pb-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Camera size={20} weight="bold" className="text-[var(--rt-accent-ink)]" />
              Avatar Studio · {player.name}
            </DialogTitle>
            <DialogDescription>
              Frame your square crop. Exported at 256x256 WebP for fast loading.
            </DialogDescription>
          </DialogHeader>
          <DialogClose
            aria-label="Close avatar dialog"
            className="rt2-focus rt2-btn-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded"
          >
            <X size={16} weight="bold" />
          </DialogClose>
        </div>

        {!srcUrl ? (
          <div className="space-y-4">
            {/* Drag-and-Drop Upload Stage */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDraggingFile(true)
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={onDropFile}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded border-2 border-dashed p-8 text-center transition ${
                isDraggingFile
                  ? "border-[var(--rt-accent)] bg-[var(--rt-accent-soft)]"
                  : "border-[var(--rt-ui-border)] bg-[var(--rt-bg)] hover:border-[var(--rt-accent)]"
              }`}
            >
              <PlayerAvatar player={player} size="lg" chamfer />
              <div>
                <p className="text-[15px] font-bold text-[var(--rt-ink)]">
                  Drop a photo here, or click to browse
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--rt-muted)]">
                  PNG, JPG, or WebP · Automatically cropped &amp; compressed
                </p>
              </div>
              <span className="rt2-btn-primary inline-flex min-h-[38px] items-center gap-1.5 rounded px-4 text-[14px] font-bold">
                <UploadSimple size={15} weight="bold" />
                Select image
              </span>
            </div>

            {player.avatarUrl && onRemove && (
              <div className="flex items-center justify-between rounded border border-[var(--rt-border-soft)] bg-[var(--rt-bg)] px-3.5 py-2.5 text-[13px]">
                <span className="text-[var(--rt-muted)]">
                  Revert to default color monogram
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onRemove()
                    onOpenChange(false)
                  }}
                  className="rt2-focus rt2-btn-danger inline-flex min-h-[34px] items-center gap-1.5 rounded px-3 text-[13px] font-bold"
                >
                  <Trash size={14} weight="bold" />
                  Remove avatar
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-5 sm:grid-cols-[240px_minmax(0,1fr)] sm:items-start">
              {/* Left: Reticle-framed Crop Stage + Zoom */}
              <div className="space-y-2.5">
                <div
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  style={{ width: CROP_VIEW_SIZE, height: CROP_VIEW_SIZE }}
                  className="relative mx-auto cursor-move touch-none select-none overflow-hidden rounded border-2 border-[var(--rt-border)] bg-[#0B0E12]"
                >
                  <img
                    ref={imgRef}
                    src={srcUrl}
                    alt="Crop preview"
                    draggable={false}
                    onLoad={(e) => {
                      const el = e.currentTarget
                      setNaturalSize({
                        w: el.naturalWidth,
                        h: el.naturalHeight,
                      })
                    }}
                    style={
                      naturalSize
                        ? {
                            width: naturalSize.w * baseScale * zoom,
                            height: naturalSize.h * baseScale * zoom,
                            transform: `translate(${offset.x}px, ${offset.y}px)`,
                          }
                        : undefined
                    }
                    className="pointer-events-none absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
                  />

                  {/* Subtle rule-of-thirds grid */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3"
                  >
                    <div className="border-r border-b border-white/20" />
                    <div className="border-r border-b border-white/20" />
                    <div className="border-b border-white/20" />
                    <div className="border-r border-b border-white/20" />
                    <div className="border-r border-b border-white/20" />
                    <div className="border-b border-white/20" />
                    <div className="border-r border-white/20" />
                    <div className="border-r border-white/20" />
                    <div />
                  </div>

                  {/* Tactical corner reticle brackets */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1.5 left-1.5 h-3.5 w-3.5 border-t-2 border-l-2 border-[var(--rt-accent)]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1.5 right-1.5 h-3.5 w-3.5 border-t-2 border-r-2 border-[var(--rt-accent)]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-1.5 left-1.5 h-3.5 w-3.5 border-b-2 border-l-2 border-[var(--rt-accent)]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-1.5 bottom-1.5 h-3.5 w-3.5 border-r-2 border-b-2 border-[var(--rt-accent)]"
                  />
                </div>

                {/* Zoom Control Row */}
                <div className="flex items-center gap-2 rounded border border-[var(--rt-border-soft)] bg-[var(--rt-bg)] px-2.5 py-1.5">
                  <MagnifyingGlassMinus
                    size={15}
                    weight="bold"
                    className="shrink-0 text-[var(--rt-muted)]"
                  />
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.05}
                    aria-label="Zoom avatar"
                    value={zoom}
                    onChange={(e) => {
                      const nextZ = Number(e.target.value)
                      setZoom(nextZ)
                      setOffset((curr) =>
                        clampOffset(curr.x, curr.y, nextZ, naturalSize)
                      )
                    }}
                    className="w-full cursor-pointer accent-[var(--rt-accent)]"
                  />
                  <MagnifyingGlassPlus
                    size={15}
                    weight="bold"
                    className="shrink-0 text-[var(--rt-muted)]"
                  />
                  <span className="tnum w-10 text-right font-arcade-mono text-[12px] font-bold text-[var(--rt-muted)]">
                    {Math.round(zoom * 100)}%
                  </span>
                </div>
              </div>

              {/* Right: Live Badge Previews + Compression Telemetry */}
              <div className="flex flex-col justify-between gap-4">
                <div className="rounded border border-[var(--rt-border-soft)] bg-[var(--rt-bg)] p-3.5">
                  <p className="font-arcade-mono text-[11px] font-bold tracking-wider text-[var(--rt-muted)] uppercase">
                    Live preview
                  </p>
                  <div className="mt-3 flex items-end gap-3.5">
                    <div className="text-center">
                      <span className="rt2-chamfer inline-flex h-16 w-16 overflow-hidden bg-[#12161B]">
                        {compressedPreview && (
                          <img
                            src={compressedPreview.dataUrl}
                            alt="Dossier preview"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <p className="mt-1 font-arcade-mono text-[11px] text-[var(--rt-muted)]">
                        Profile
                      </p>
                    </div>
                    <div className="text-center">
                      <span className="inline-flex h-10 w-10 overflow-hidden rounded-sm bg-[#12161B]">
                        {compressedPreview && (
                          <img
                            src={compressedPreview.dataUrl}
                            alt="Ranks preview"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <p className="mt-1 font-arcade-mono text-[11px] text-[var(--rt-muted)]">
                        Ranks
                      </p>
                    </div>
                    <div className="text-center">
                      <span className="inline-flex h-7 w-7 overflow-hidden rounded-xs bg-[#12161B]">
                        {compressedPreview && (
                          <img
                            src={compressedPreview.dataUrl}
                            alt="Crew preview"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <p className="mt-1 font-arcade-mono text-[11px] text-[var(--rt-muted)]">
                        Crew
                      </p>
                    </div>
                  </div>
                </div>

                {compressedPreview && (
                  <div className="rounded border border-[var(--rt-border-soft)] bg-[var(--rt-bg)] p-3 font-arcade-mono text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--rt-muted)]">Output</span>
                      <span className="font-bold text-[var(--rt-teal-ink)]">
                        {EXPORT_SIZE}x{EXPORT_SIZE} {compressedPreview.mime}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[var(--rt-muted)]">Size</span>
                      <span className="tnum font-bold">
                        {formatBytes(origSizeBytes)} -&gt;{" "}
                        <span className="text-[var(--rt-teal-ink)]">
                          {formatBytes(compressedPreview.bytes)}
                        </span>
                      </span>
                    </div>
                    {savedPct > 0 && (
                      <p className="mt-1 text-right text-[11px] font-bold text-[var(--rt-teal-ink)]">
                        {savedPct}% smaller
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rt2-focus rt2-btn-secondary inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded px-3 text-[13px] font-bold"
                  >
                    <UploadSimple size={14} weight="bold" />
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(1)
                      setOffset({ x: 0, y: 0 })
                    }}
                    className="rt2-focus rt2-btn-secondary inline-flex min-h-[36px] items-center justify-center gap-1 rounded px-3 text-[13px] font-bold"
                  >
                    <ArrowCounterClockwise size={14} weight="bold" />
                    Reset
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--rt-border-soft)] pt-3">
              <DialogClose className="rt2-focus rt2-btn-secondary min-h-[42px] rounded px-4 text-[14px] font-bold">
                Cancel
              </DialogClose>
              <button
                type="button"
                disabled={!compressedPreview}
                onClick={async () => {
                  if (!compressedPreview) return
                  const res = await fetch(compressedPreview.dataUrl)
                  const blob = await res.blob()
                  await onSave(blob)
                  onOpenChange(false)
                }}
                className="rt2-focus rt2-btn-primary inline-flex min-h-[42px] items-center gap-1.5 rounded px-4 text-[14px] font-bold"
              >
                <Check size={16} weight="bold" />
                Save avatar
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
