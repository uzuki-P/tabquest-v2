import { isFullImage, isUsableBox } from "@/lib/redaction"
import type { RedactionBox } from "@/lib/redaction"

/**
 * Edits made to a picked image. Every box, the crop included, is in
 * fractions of the original image, so boxes stay put when the crop changes.
 */
export type ImageEdits = {
  boxes: RedactionBox[]
  /** The area kept; null keeps the whole image. */
  crop: RedactionBox | null
}

export const NO_EDITS: ImageEdits = { boxes: [], crop: null }

export type ImageOutputMime = "image/webp" | "image/jpeg"

export interface ImageEncodePreset {
  maxSide: number
  mimeType: ImageOutputMime
  quality: number
  suffix: string
}

/** R2 receipt storage preset: <=3000px longest side, WebP @ 0.90. */
export const RECEIPT_STORAGE_PRESET: ImageEncodePreset = {
  maxSide: 3000,
  mimeType: "image/webp",
  quality: 0.9,
  suffix: "receipt",
}

/** OCR submission preset: <=2000px longest side, JPEG @ 0.85. */
export const RECEIPT_OCR_PRESET: ImageEncodePreset = {
  maxSide: 2000,
  mimeType: "image/jpeg",
  quality: 0.85,
  suffix: "ocr",
}

/** Player avatar storage preset: <=512px longest side, WebP @ 0.88. */
export const AVATAR_STORAGE_PRESET: ImageEncodePreset = {
  maxSide: 512,
  mimeType: "image/webp",
  quality: 0.88,
  suffix: "avatar",
}

/** Worker-side upload limit (15 MiB). */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

export function hasEdits(edits: ImageEdits): boolean {
  return edits.boxes.length > 0 || edits.crop !== null
}

/** Drops boxes shrunk to nothing and a crop that keeps the whole image. */
export function cleanEdits(edits: ImageEdits): ImageEdits {
  const boxes = edits.boxes.filter(isUsableBox)
  const crop =
    edits.crop && isUsableBox(edits.crop) && !isFullImage(edits.crop)
      ? edits.crop
      : null
  if (boxes.length === edits.boxes.length && crop === edits.crop) return edits
  return { boxes, crop }
}

/**
 * A picked image together with its edits. `file` is the flattened copy that
 * gets uploaded; `source` is the untouched original, kept so the edits can be
 * changed again and so a newly picked file can be told apart from the one
 * these edits belong to.
 */
export type EditedImage = {
  source: File
  edits: ImageEdits
  file: File
  /** True while it holds Parse suggestions the admin has not reviewed. */
  suggested: boolean
}

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/** Pixel rectangle covering a fractional box, rounded outward. */
export function pixelRect(
  box: RedactionBox,
  width: number,
  height: number
): PixelRect {
  const x0 = Math.floor(box.x * width)
  const y0 = Math.floor(box.y * height)
  const x1 = Math.ceil((box.x + box.width) * width)
  const y1 = Math.ceil((box.y + box.height) * height)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * Scales dimensions down proportionally so neither side exceeds `maxSide`.
 * Never upscales images that are already within `maxSide`.
 */
export function fitWithinMaxSide(
  width: number,
  height: number,
  maxSide: number
): { width: number; height: number; scale: number } {
  const safeW = Math.max(1, Math.round(width))
  const safeH = Math.max(1, Math.round(height))
  const longest = Math.max(safeW, safeH)
  if (maxSide <= 0 || longest <= maxSide) {
    return { width: safeW, height: safeH, scale: 1 }
  }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
    scale,
  }
}

/**
 * Sniffs common image formats from leading magic bytes. Used on the Worker
 * before writing to R2 so spoofed Content-Type headers are rejected.
 */
export function detectImageMimeType(
  bytes: Uint8Array
): "image/webp" | "image/jpeg" | "image/png" | null {
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png"
  }
  return null
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  mimeType: ImageOutputMime,
  quality: number
): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality)
  )
}

/**
 * Paints solid black rectangles over the image in the browser, crops it,
 * resizes it to fit within the preset's `maxSide`, and encodes it to WebP
 * (with automatic JPEG fallback if the browser lacks WebP canvas encoding).
 * Drawing to `<canvas>` strips EXIF metadata automatically.
 */
export async function flattenEdits(
  source: Blob,
  edits: ImageEdits,
  name: string,
  preset: ImageEncodePreset = RECEIPT_STORAGE_PRESET
): Promise<File> {
  const bitmap = await createImageBitmap(source)
  try {
    const rawCrop = edits.crop
      ? pixelRect(edits.crop, bitmap.width, bitmap.height)
      : { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
    const cropWidth = Math.max(
      1,
      Math.min(rawCrop.width, bitmap.width - rawCrop.x)
    )
    const cropHeight = Math.max(
      1,
      Math.min(rawCrop.height, bitmap.height - rawCrop.y)
    )
    const target = fitWithinMaxSide(cropWidth, cropHeight, preset.maxSide)

    const canvas = document.createElement("canvas")
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas 2D is not available.")

    context.drawImage(
      bitmap,
      rawCrop.x,
      rawCrop.y,
      cropWidth,
      cropHeight,
      0,
      0,
      target.width,
      target.height
    )

    context.fillStyle = "#000"
    for (const box of edits.boxes) {
      const rect = pixelRect(box, bitmap.width, bitmap.height)
      context.fillRect(
        (rect.x - rawCrop.x) * target.scale,
        (rect.y - rawCrop.y) * target.scale,
        rect.width * target.scale,
        rect.height * target.scale
      )
    }

    let blob = await encodeCanvas(canvas, preset.mimeType, preset.quality)
    let actualMime: ImageOutputMime = preset.mimeType
    if (
      preset.mimeType === "image/webp" &&
      (!blob || blob.type !== "image/webp")
    ) {
      blob = await encodeCanvas(canvas, "image/jpeg", 0.9)
      actualMime = "image/jpeg"
    }
    if (!blob) throw new Error("The edited image could not be encoded.")

    const base = name.replace(/\.[^.]+$/, "") || "image"
    const ext = actualMime === "image/webp" ? "webp" : "jpg"
    return new File([blob], `${base}-${preset.suffix}.${ext}`, {
      type: actualMime,
    })
  } finally {
    bitmap.close()
  }
}

/** Prepares a receipt for R2 storage (<=3000px WebP @ 0.90, EXIF stripped). */
export function prepareReceiptForStorage(
  source: Blob,
  edits: ImageEdits,
  name: string
): Promise<File> {
  return flattenEdits(source, cleanEdits(edits), name, RECEIPT_STORAGE_PRESET)
}

/** Prepares a receipt for vision-api OCR (<=2000px JPEG @ 0.85, EXIF stripped). */
export function prepareReceiptForOcr(
  source: Blob,
  edits: ImageEdits,
  name: string
): Promise<File> {
  return flattenEdits(source, cleanEdits(edits), name, RECEIPT_OCR_PRESET)
}

/** Builds the EditedImage state, or null when the edits change nothing. */
export async function editFile(
  source: File,
  edits: ImageEdits,
  suggested: boolean
): Promise<EditedImage | null> {
  const clean = cleanEdits(edits)
  if (!hasEdits(clean)) return null
  const file = await prepareReceiptForStorage(source, clean, source.name)
  return { source, edits: clean, file, suggested }
}
