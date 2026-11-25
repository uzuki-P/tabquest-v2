import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import { getPlayerDetail } from "@/server/services/queries"

export const Route = createFileRoute("/api/public/players/$playerId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const url = new URL(request.url)
          const month = url.searchParams.get("month")
          const db = createDb(env.DB)
          const data = await getPlayerDetail(db, params.playerId, month)
          return jsonNoStore(data)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
