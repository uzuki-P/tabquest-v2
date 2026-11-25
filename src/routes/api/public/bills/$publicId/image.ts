import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"

import { bills, createDb } from "@/db"
import {
  PUBLIC_RECEIPT_CACHE_CONTROL,
  buildR2ImageResponse,
} from "@/lib/r2-storage"

export const Route = createFileRoute("/api/public/bills/$publicId/image")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const db = createDb(env.DB)

        // Lookup by unique `bills.public_id` (hits `bills_public_id_uq`).
        const [bill] = await db
          .select({
            status: bills.status,
            archivedAt: bills.archivedAt,
            imageObjectKey: bills.imageObjectKey,
            imageMediaType: bills.imageMediaType,
          })
          .from(bills)
          .where(eq(bills.publicId, params.publicId))
          .limit(1)

        // Never leak draft or archived receipts on the public route.
        if (
          !bill ||
          bill.status !== "published" ||
          bill.archivedAt !== null ||
          !bill.imageObjectKey
        ) {
          return Response.json(
            { error: "Receipt image not found." },
            { status: 404 }
          )
        }

        const object = await env.RECEIPTS.get(bill.imageObjectKey)
        if (!object) {
          return Response.json(
            { error: "Receipt image not found." },
            { status: 404 }
          )
        }

        return buildR2ImageResponse(request, object, {
          cacheControl: PUBLIC_RECEIPT_CACHE_CONTROL,
          fallbackContentType: bill.imageMediaType,
        })
      },
    },
  },
})
