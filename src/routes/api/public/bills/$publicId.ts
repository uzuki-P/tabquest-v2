import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { getPublicBillDetail } from "@/server/services/bills"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"

export const Route = createFileRoute("/api/public/bills/$publicId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const db = createDb(env.DB)
          const data = await getPublicBillDetail(db, params.publicId)
          return jsonNoStore(data)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
