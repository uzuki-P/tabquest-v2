import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAdmin } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import { deleteAdminUser } from "@/server/services/players"

export const Route = createFileRoute("/api/admin/users/$userId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const admin = await requireAdmin(request, env)
          const db = createDb(env.DB)
          const deleted = await deleteAdminUser(
            db,
            params.userId,
            admin.user.id
          )
          return jsonNoStore(deleted)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
