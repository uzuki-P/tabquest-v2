import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAdmin } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import {
  getAdminSettings,
  updateAppSettings,
  updateAppSettingsSchema,
} from "@/server/services/settings"

export const Route = createFileRoute("/api/admin/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request, env)
          const db = createDb(env.DB)
          const data = await getAdminSettings(db)
          return jsonNoStore(data)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
      PUT: async ({ request }) => {
        try {
          const authSession = await requireAdmin(request, env)
          const body = updateAppSettingsSchema.parse(await request.json())
          const db = createDb(env.DB)
          const updated = await updateAppSettings(
            db,
            body,
            authSession.user.email
          )
          return jsonNoStore(updated)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
