import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { requireAdmin, toAuthErrorResponse } from "@/lib/auth"
import {
  ADMIN_RECEIPT_CACHE_CONTROL,
  buildR2ImageResponse,
  isSafeReceiptObjectKey,
} from "@/lib/r2-storage"

export const Route = createFileRoute("/api/admin/uploads/$objectKey")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          await requireAdmin(request, env)
        } catch (error) {
          const authResponse = toAuthErrorResponse(error)
          if (authResponse) return authResponse
          throw error
        }

        const { objectKey } = params
        if (!isSafeReceiptObjectKey(objectKey)) {
          return Response.json(
            { error: "Invalid receipt object key." },
            { status: 400 }
          )
        }

        const object = await env.RECEIPTS.get(objectKey)
        if (!object) {
          return Response.json(
            { error: "Receipt image not found." },
            { status: 404 }
          )
        }

        return buildR2ImageResponse(request, object, {
          cacheControl: ADMIN_RECEIPT_CACHE_CONTROL,
        })
      },
    },
  },
})
