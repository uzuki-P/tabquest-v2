import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { requireAdmin, toAuthErrorResponse } from "@/lib/auth"
import {
  MAX_RECEIPT_UPLOAD_BYTES,
  buildReceiptObjectKey,
  extractUploadedBytes,
  validateImageUpload,
} from "@/lib/r2-storage"

export const Route = createFileRoute("/api/admin/uploads/receipt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireAdmin(request, env)
        } catch (error) {
          const authResponse = toAuthErrorResponse(error)
          if (authResponse) return authResponse
          throw error
        }

        const extracted = await extractUploadedBytes(
          request,
          MAX_RECEIPT_UPLOAD_BYTES
        )
        if (!extracted.ok) {
          return Response.json(
            { error: extracted.error },
            { status: extracted.status }
          )
        }

        const validated = validateImageUpload(
          extracted.bytes,
          MAX_RECEIPT_UPLOAD_BYTES
        )
        if (!validated.ok) {
          return Response.json(
            { error: validated.error },
            { status: validated.status }
          )
        }

        const objectKey = buildReceiptObjectKey(validated.extension)

        await env.RECEIPTS.put(objectKey, extracted.bytes, {
          httpMetadata: {
            contentType: validated.mediaType,
          },
        })

        return Response.json(
          {
            objectKey,
            mediaType: validated.mediaType,
            byteSize: validated.byteSize,
          },
          {
            status: 201,
            headers: {
              "Cache-Control": "no-store",
            },
          }
        )
      },
    },
  },
})
