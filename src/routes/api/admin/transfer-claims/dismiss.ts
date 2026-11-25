import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAdmin } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import {
  dismissTransferClaim,
  dismissTransferClaimSchema,
} from "@/server/services/payments"

export const Route = createFileRoute("/api/admin/transfer-claims/dismiss")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authSession = await requireAdmin(request, env)
          const body = dismissTransferClaimSchema.parse(await request.json())
          const db = createDb(env.DB)
          const result = await dismissTransferClaim(
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
