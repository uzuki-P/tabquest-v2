import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAuth } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import { linkMyPlayer, linkMyPlayerSchema } from "@/server/services/players"

export const Route = createFileRoute("/api/me/link-player")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authSession = await requireAuth(request, env)
          const body = linkMyPlayerSchema.parse(await request.json())
          const db = createDb(env.DB)
          const result = await linkMyPlayer(db, {
            userId: authSession.user.id,
            userEmail: authSession.user.email,
            playerId: body.playerId,
          })
          return jsonNoStore(result, 200)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
