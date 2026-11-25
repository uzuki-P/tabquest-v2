import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import { getRanksFeed } from "@/server/services/queries"

export const Route = createFileRoute("/api/public/ranks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const scopeParam = url.searchParams.get("scope")
          const scope = scopeParam === "all-time" ? "all-time" : "monthly"
          const month = url.searchParams.get("month")
          const db = createDb(env.DB)
          const data = await getRanksFeed(db, scope, month)
          return jsonNoStore(data)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
