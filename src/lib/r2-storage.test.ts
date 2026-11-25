import { describe, expect, it } from "bun:test"

import {
  MAX_AVATAR_UPLOAD_BYTES,
  MAX_RECEIPT_UPLOAD_BYTES,
  PUBLIC_RECEIPT_CACHE_CONTROL,
  buildAvatarObjectKey,
  buildR2ImageResponse,
  buildReceiptObjectKey,
  extractUploadedBytes,
  formatR2Etag,
  isSafeReceiptObjectKey,
  matchesIfNoneMatch,
  validateImageUpload,
} from "@/lib/r2-storage"

const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56,
  0x50, 0x38, 0x20,
])
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
])
const TEXT_BYTES = new TextEncoder().encode("not an image")

describe("validateImageUpload", () => {
  it("accepts valid WebP, JPEG, and PNG magic bytes", () => {
    expect(validateImageUpload(WEBP_BYTES, MAX_RECEIPT_UPLOAD_BYTES)).toEqual({
      ok: true,
      mediaType: "image/webp",
      extension: "webp",
      byteSize: WEBP_BYTES.byteLength,
    })

    expect(validateImageUpload(JPEG_BYTES, MAX_RECEIPT_UPLOAD_BYTES)).toEqual({
      ok: true,
      mediaType: "image/jpeg",
      extension: "jpg",
      byteSize: JPEG_BYTES.byteLength,
    })

    expect(validateImageUpload(PNG_BYTES, MAX_AVATAR_UPLOAD_BYTES)).toEqual({
      ok: true,
      mediaType: "image/png",
      extension: "png",
      byteSize: PNG_BYTES.byteLength,
    })
  })

  it("rejects empty files with 400", () => {
    const result = validateImageUpload(
      new Uint8Array(),
      MAX_RECEIPT_UPLOAD_BYTES
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
    }
  })

  it("rejects oversized files with 413", () => {
    const oversized = new Uint8Array(MAX_AVATAR_UPLOAD_BYTES + 1)
    oversized.set(WEBP_BYTES, 0)
    const result = validateImageUpload(oversized, MAX_AVATAR_UPLOAD_BYTES)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(413)
    }
  })

  it("rejects spoofed or unknown magic bytes with 415", () => {
    const result = validateImageUpload(TEXT_BYTES, MAX_RECEIPT_UPLOAD_BYTES)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(415)
    }
  })
})

describe("R2 object keys and safety guards", () => {
  it("builds receipt keys matching legacy <uuid>.<ext> convention", () => {
    expect(buildReceiptObjectKey("webp", "019a1234-5678-7000-8000-000000000001")).toBe(
      "019a1234-5678-7000-8000-000000000001.webp"
    )
    const generated = buildReceiptObjectKey("webp")
    expect(generated.endsWith(".webp")).toBe(true)
    expect(isSafeReceiptObjectKey(generated)).toBe(true)
  })

  it("builds avatar keys under avatars/<playerId>-<uuidv7>.<ext>", () => {
    expect(
      buildAvatarObjectKey("player-42", "webp", "019a1234-5678-7000-8000-000000000002")
    ).toBe("avatars/player-42-019a1234-5678-7000-8000-000000000002.webp")
  })

  it("rejects unsafe or traversal receipt object keys", () => {
    expect(isSafeReceiptObjectKey("019a1234.webp")).toBe(true)
    expect(isSafeReceiptObjectKey("../secret.webp")).toBe(false)
    expect(isSafeReceiptObjectKey("avatars/player-1.webp")).toBe(false)
    expect(isSafeReceiptObjectKey("foo\\bar.webp")).toBe(false)
    expect(isSafeReceiptObjectKey("..")).toBe(false)
    expect(isSafeReceiptObjectKey("")).toBe(false)
  })
})

describe("ETag and If-None-Match handling", () => {
  it("formats raw and quoted ETags consistently", () => {
    expect(formatR2Etag('"abc123"', "abc123")).toBe('"abc123"')
    expect(formatR2Etag(undefined, "abc123")).toBe('"abc123"')
    expect(formatR2Etag('W/"weak"', undefined)).toBe('W/"weak"')
    expect(formatR2Etag(undefined, undefined)).toBeNull()
  })

  it("matches wildcard, weak, and comma-separated If-None-Match headers", () => {
    expect(matchesIfNoneMatch('"abc123"', '"abc123"')).toBe(true)
    expect(matchesIfNoneMatch('W/"abc123"', '"abc123"')).toBe(true)
    expect(matchesIfNoneMatch('"other", "abc123"', '"abc123"')).toBe(true)
    expect(matchesIfNoneMatch("*", '"abc123"')).toBe(true)
    expect(matchesIfNoneMatch('"different"', '"abc123"')).toBe(false)
    expect(matchesIfNoneMatch(null, '"abc123"')).toBe(false)
  })
})

describe("extractUploadedBytes & buildR2ImageResponse", () => {
  it("extracts bytes from multipart/form-data file uploads", async () => {
    const form = new FormData()
    form.set("file", new File([WEBP_BYTES], "receipt.webp", { type: "image/webp" }))
    const request = new Request("https://example.com/api/admin/uploads/receipt", {
      method: "POST",
      body: form,
    })

    const extracted = await extractUploadedBytes(request, MAX_RECEIPT_UPLOAD_BYTES)
    expect(extracted.ok).toBe(true)
    if (extracted.ok) {
      expect(Array.from(extracted.bytes)).toEqual(Array.from(WEBP_BYTES))
    }
  })

  it("extracts bytes from raw binary uploads", async () => {
    const request = new Request("https://example.com/api/me/avatar", {
      method: "POST",
      headers: { "Content-Type": "image/jpeg" },
      body: JPEG_BYTES,
    })

    const extracted = await extractUploadedBytes(request, MAX_AVATAR_UPLOAD_BYTES)
    expect(extracted.ok).toBe(true)
    if (extracted.ok) {
      expect(Array.from(extracted.bytes)).toEqual(Array.from(JPEG_BYTES))
    }
  })

  it("returns 200 with headers or 304 when If-None-Match matches", async () => {
    const makeMockObject = () =>
      ({
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(WEBP_BYTES)
            controller.close()
          },
        }),
        size: WEBP_BYTES.byteLength,
        etag: "etag-1",
        httpEtag: '"etag-1"',
        httpMetadata: {
          contentType: "image/webp",
        },
      }) as unknown as R2ObjectBody

    const res200 = buildR2ImageResponse(
      new Request("https://example.com/api/public/bills/pub-1/image"),
      makeMockObject(),
      { cacheControl: PUBLIC_RECEIPT_CACHE_CONTROL }
    )
    expect(res200.status).toBe(200)
    expect(res200.headers.get("Content-Type")).toBe("image/webp")
    expect(res200.headers.get("ETag")).toBe('"etag-1"')
    expect(res200.headers.get("Cache-Control")).toBe(
      PUBLIC_RECEIPT_CACHE_CONTROL
    )
    expect(res200.headers.get("X-Content-Type-Options")).toBe("nosniff")

    const res304 = buildR2ImageResponse(
      new Request("https://example.com/api/public/bills/pub-1/image", {
        headers: { "If-None-Match": '"etag-1"' },
      }),
      makeMockObject(),
      { cacheControl: PUBLIC_RECEIPT_CACHE_CONTROL }
    )
    expect(res304.status).toBe(304)
    expect(res304.headers.get("ETag")).toBe('"etag-1"')
  })
})
