import { uuidv7 } from "uuidv7"

import { MAX_UPLOAD_BYTES, detectImageMimeType } from "@/lib/image-edits"

export type AllowedImageMime = "image/webp" | "image/jpeg" | "image/png"

/** Maximum receipt upload size in bytes (15 MiB). */
export const MAX_RECEIPT_UPLOAD_BYTES = MAX_UPLOAD_BYTES

/** Maximum player avatar upload size in bytes (2 MiB). */
export const MAX_AVATAR_UPLOAD_BYTES = 2 * 1024 * 1024

/** Cache header for immutable receipt images served via public bill routes. */
export const PUBLIC_RECEIPT_CACHE_CONTROL =
  "public, max-age=31536000, immutable"

/** Cache header for admin draft/archived receipt previews. */
export const ADMIN_RECEIPT_CACHE_CONTROL = "private, max-age=300"

/**
 * Cache header for public player avatars.
 * Uses short max-age + ETag revalidation because a player's avatar URL stays
 * stable (`/api/public/players/$playerId/avatar`) when they upload a new image.
 */
export const PUBLIC_AVATAR_CACHE_CONTROL = "public, max-age=300, must-revalidate"

const SAFE_OBJECT_KEY_RE = /^[a-zA-Z0-9._-]+$/

const MIME_TO_EXTENSION: Record<AllowedImageMime, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
}

export function mimeToExtension(mime: AllowedImageMime): string {
  return MIME_TO_EXTENSION[mime]
}

export type ImageUploadValidationResult =
  | {
      ok: true
      mediaType: AllowedImageMime
      extension: string
      byteSize: number
    }
  | {
      ok: false
      status: 400 | 413 | 415
      error: string
    }

/**
 * Validates raw uploaded image bytes against size limits and magic-byte
 * signatures (WebP, JPEG, PNG). Never trusts the client-supplied Content-Type.
 */
export function validateImageUpload(
  bytes: Uint8Array,
  maxBytes: number
): ImageUploadValidationResult {
  if (bytes.byteLength === 0) {
    return {
      ok: false,
      status: 400,
      error: "Uploaded file is empty.",
    }
  }
  if (bytes.byteLength > maxBytes) {
    const maxMiB = Math.round((maxBytes / (1024 * 1024)) * 10) / 10
    return {
      ok: false,
      status: 413,
      error: `File exceeds the ${maxMiB} MiB size limit.`,
    }
  }

  const detected = detectImageMimeType(bytes)
  if (!detected) {
    return {
      ok: false,
      status: 415,
      error: "Unsupported image format. Upload a WebP, JPEG, or PNG image.",
    }
  }

  return {
    ok: true,
    mediaType: detected,
    extension: mimeToExtension(detected),
    byteSize: bytes.byteLength,
  }
}

/**
 * Builds an R2 object key for a receipt (`<uuidv7>.<ext>`), matching legacy
 * Tabquest v1's `<uuid>.webp` key convention.
 */
export function buildReceiptObjectKey(
  extension: string,
  id: string = uuidv7()
): string {
  return `${id}.${extension}`
}

/**
 * Builds an R2 object key for a player avatar (`avatars/<playerId>-<uuidv7>.<ext>`).
 */
export function buildAvatarObjectKey(
  playerId: string,
  extension: string,
  id: string = uuidv7()
): string {
  return `avatars/${playerId}-${id}.${extension}`
}

/**
 * Guards admin receipt object-key route params against path traversal or
 * directory escapes. Only flat bucket-root keys (`<id>.<ext>`) are accepted.
 */
export function isSafeReceiptObjectKey(objectKey: string): boolean {
  if (!objectKey || objectKey.length > 200) return false
  if (objectKey === "." || objectKey === ".." || objectKey.includes("..")) {
    return false
  }
  return SAFE_OBJECT_KEY_RE.test(objectKey)
}

/**
 * Formats an R2 object ETag as a quoted HTTP ETag header value.
 */
export function formatR2Etag(
  httpEtag?: string | null,
  etag?: string | null
): string | null {
  const raw = (httpEtag ?? etag ?? "").trim()
  if (!raw) return null
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith('W/"') && raw.endsWith('"'))
  ) {
    return raw
  }
  return `"${raw.replaceAll('"', "")}"`
}

function stripWeakPrefix(tag: string): string {
  return tag.startsWith("W/") ? tag.slice(2) : tag
}

/**
 * Evaluates an HTTP `If-None-Match` header against a response ETag per RFC 9110
 * weak comparison rules for `GET`/`HEAD` requests.
 */
export function matchesIfNoneMatch(
  ifNoneMatch: string | null,
  etag: string | null
): boolean {
  if (!ifNoneMatch || !etag) return false
  const trimmed = ifNoneMatch.trim()
  if (trimmed === "*") return true

  const target = stripWeakPrefix(etag.trim())
  for (const part of trimmed.split(",")) {
    const candidate = stripWeakPrefix(part.trim())
    if (candidate === target) return true
  }
  return false
}

export type ExtractedUpload =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; status: 400 | 413; error: string }

/**
 * Reads uploaded image bytes from either `multipart/form-data` (field `"file"`
 * or first file field) or a raw binary request body.
 */
export async function extractUploadedBytes(
  request: Request,
  maxBytes: number
): Promise<ExtractedUpload> {
  const contentLengthHeader = request.headers.get("content-length")
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader)
    // Allow modest multipart boundary overhead before reading formData.
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > maxBytes + 64 * 1024
    ) {
      const maxMiB = Math.round((maxBytes / (1024 * 1024)) * 10) / 10
      return {
        ok: false,
        status: 413,
        error: `Upload exceeds the ${maxMiB} MiB size limit.`,
      }
    }
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase()

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return {
        ok: false,
        status: 400,
        error: "Invalid multipart form data.",
      }
    }

    const explicitFile = formData.get("file")
    let fileBlob: Blob | null =
      explicitFile !== null && typeof explicitFile !== "string"
        ? explicitFile
        : null

    if (!fileBlob) {
      for (const value of formData.values()) {
        if (typeof value !== "string") {
          fileBlob = value
          break
        }
      }
    }

    if (!fileBlob) {
      return {
        ok: false,
        status: 400,
        error: "Missing image file in multipart form field `file`.",
      }
    }

    if (fileBlob.size > maxBytes) {
      const maxMiB = Math.round((maxBytes / (1024 * 1024)) * 10) / 10
      return {
        ok: false,
        status: 413,
        error: `File exceeds the ${maxMiB} MiB size limit.`,
      }
    }

    return {
      ok: true,
      bytes: new Uint8Array(await fileBlob.arrayBuffer()),
    }
  }

  const buffer = await request.arrayBuffer()
  if (buffer.byteLength > maxBytes) {
    const maxMiB = Math.round((maxBytes / (1024 * 1024)) * 10) / 10
    return {
      ok: false,
      status: 413,
      error: `File exceeds the ${maxMiB} MiB size limit.`,
    }
  }

  return {
    ok: true,
    bytes: new Uint8Array(buffer),
  }
}

export interface R2ImageResponseOptions {
  cacheControl: string
  fallbackContentType?: string | null
}

/**
 * Builds an HTTP Response for an R2 image object with `Content-Type`, `ETag`,
 * `If-None-Match` (304 Not Modified), `Cache-Control`, and `nosniff`.
 */
export function buildR2ImageResponse(
  request: Request,
  object: R2ObjectBody,
  options: R2ImageResponseOptions
): Response {
  const etag = formatR2Etag(object.httpEtag, object.etag)
  const contentType =
    object.httpMetadata?.contentType ??
    options.fallbackContentType ??
    "application/octet-stream"

  const headers = new Headers()
  headers.set("Content-Type", contentType)
  headers.set("Cache-Control", options.cacheControl)
  headers.set("X-Content-Type-Options", "nosniff")
  if (etag) {
    headers.set("ETag", etag)
  }

  if (matchesIfNoneMatch(request.headers.get("if-none-match"), etag)) {
    // Cancel the unread R2 stream cleanly on 304 responses.
    void object.body.cancel().catch(() => {})
    return new Response(null, { status: 304, headers })
  }

  headers.set("Content-Length", String(object.size))
  return new Response(object.body, { status: 200, headers })
}
