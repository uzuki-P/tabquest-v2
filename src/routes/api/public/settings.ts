import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { toServiceErrorResponse } from "@/server/services/errors"
import { getPublicSettings } from "@/server/services/settings"

export const Route = createFileRoute("/api/public/settings")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const db = createDb(env.DB)
          const branding = await getPublicSettings(db)
          return Response.json(branding, {
            headers: {
              "Cache-Control": "public, max-age=60",
            },
          })
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
