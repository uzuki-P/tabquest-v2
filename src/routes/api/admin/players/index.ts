import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAdmin } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import {
  createPlayer,
  createPlayerSchema,
  listAdminPlayers,
} from "@/server/services/players"

export const Route = createFileRoute("/api/admin/players/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request, env)
          const db = createDb(env.DB)
          const data = await listAdminPlayers(db)
          return jsonNoStore(data)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
      POST: async ({ request }) => {
        try {
          await requireAdmin(request, env)
          const body = createPlayerSchema.parse(await request.json())
          const db = createDb(env.DB)
          const created = await createPlayer(db, body)
          return jsonNoStore(created, 201)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
