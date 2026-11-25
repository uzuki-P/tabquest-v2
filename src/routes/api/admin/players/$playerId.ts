import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAdmin } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import { updatePlayer, updatePlayerSchema } from "@/server/services/players"

export const Route = createFileRoute("/api/admin/players/$playerId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          await requireAdmin(request, env)
          const body = updatePlayerSchema.parse(await request.json())
          const db = createDb(env.DB)
          const updated = await updatePlayer(
            db,
            env.RECEIPTS,
            params.playerId,
            body
          )
          return jsonNoStore(updated)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
