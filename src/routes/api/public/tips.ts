import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import { getTipWall } from "@/server/services/queries"

export const Route = createFileRoute("/api/public/tips")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const month = url.searchParams.get("month")
          const db = createDb(env.DB)
          const data = await getTipWall(db, month)
          return jsonNoStore(data)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
