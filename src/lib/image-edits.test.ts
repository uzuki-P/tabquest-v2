import { describe, expect, test } from "bun:test"

import {
  AVATAR_STORAGE_PRESET,
  NO_EDITS,
  RECEIPT_OCR_PRESET,
  RECEIPT_STORAGE_PRESET,
  cleanEdits,
  detectImageMimeType,
  fitWithinMaxSide,
  hasEdits,
  pixelRect,
} from "./image-edits"

describe("cleanEdits and hasEdits", () => {
  test("NO_EDITS has no edits", () => {
    expect(hasEdits(NO_EDITS)).toBe(false)
    expect(cleanEdits(NO_EDITS)).toBe(NO_EDITS)
  })

  test("drops unusable tiny boxes and full-image crops", () => {
    const cleaned = cleanEdits({
      boxes: [
        { x: 0.1, y: 0.1, width: 0.001, height: 0.2 },
        { x: 0.2, y: 0.3, width: 0.2, height: 0.05 },
      ],
      crop: { x: 0, y: 0, width: 1, height: 1 },
    })
    expect(cleaned.boxes).toHaveLength(1)
    expect(cleaned.crop).toBeNull()
    expect(hasEdits(cleaned)).toBe(true)
  })
})

describe("fitWithinMaxSide", () => {
  test("does not upscale images already within maxSide", () => {
    expect(fitWithinMaxSide(1200, 800, 3000)).toEqual({
      width: 1200,
      height: 800,
      scale: 1,
    })
  })

  test("scales tall receipt images down to RECEIPT_STORAGE_PRESET maxSide", () => {
    const result = fitWithinMaxSide(1500, 6000, RECEIPT_STORAGE_PRESET.maxSide)
    expect(result.width).toBe(750)
    expect(result.height).toBe(3000)
    expect(result.scale).toBe(0.5)
  })

  test("scales wide images down to RECEIPT_OCR_PRESET maxSide", () => {
    const result = fitWithinMaxSide(4000, 2000, RECEIPT_OCR_PRESET.maxSide)
    expect(result.width).toBe(2000)
    expect(result.height).toBe(1000)
    expect(result.scale).toBe(0.5)
  })

  test("presets match documented quality and size targets", () => {
    expect(RECEIPT_STORAGE_PRESET.maxSide).toBe(3000)
    expect(RECEIPT_STORAGE_PRESET.mimeType).toBe("image/webp")
    expect(RECEIPT_STORAGE_PRESET.quality).toBe(0.9)

    expect(RECEIPT_OCR_PRESET.maxSide).toBe(2000)
    expect(RECEIPT_OCR_PRESET.mimeType).toBe("image/jpeg")
    expect(RECEIPT_OCR_PRESET.quality).toBe(0.85)

    expect(AVATAR_STORAGE_PRESET.maxSide).toBe(512)
    expect(AVATAR_STORAGE_PRESET.mimeType).toBe("image/webp")
  })
})

describe("pixelRect", () => {
  test("rounds fractional coordinates outward to cover every edge pixel", () => {
    expect(
      pixelRect({ x: 0.105, y: 0.205, width: 0.3, height: 0.4 }, 100, 100)
    ).toEqual({ x: 10, y: 20, width: 31, height: 41 })
  })
})

describe("detectImageMimeType", () => {
  test("detects WebP, JPEG, and PNG magic bytes", () => {
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ])
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    const txt = new TextEncoder().encode("not an image")

    expect(detectImageMimeType(webp)).toBe("image/webp")
    expect(detectImageMimeType(jpeg)).toBe("image/jpeg")
    expect(detectImageMimeType(png)).toBe("image/png")
    expect(detectImageMimeType(txt)).toBeNull()
  })
})
