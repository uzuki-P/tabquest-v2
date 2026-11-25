import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAuth } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import {
  createTransferClaimForUser,
  createTransferClaimSchema,
} from "@/server/services/payments"

export const Route = createFileRoute("/api/me/transfer-claims")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authSession = await requireAuth(request, env)
          const body = createTransferClaimSchema.parse(await request.json())
          const db = createDb(env.DB)
          const claim = await createTransferClaimForUser(
            db,
            authSession.user.id,
            body
          )
          return jsonNoStore(claim, 201)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
