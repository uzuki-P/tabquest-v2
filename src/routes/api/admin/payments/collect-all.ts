import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAdmin } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import {
  collectAllForPlayer,
  collectAllSchema,
} from "@/server/services/payments"

export const Route = createFileRoute("/api/admin/payments/collect-all")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authSession = await requireAdmin(request, env)
          const body = collectAllSchema.parse(await request.json())
          const db = createDb(env.DB)
          const result = await collectAllForPlayer(
            db,
            body,
            authSession.user.email
          )
          return jsonNoStore(result)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
