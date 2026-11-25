import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAdmin } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import {
  toggleBillPlayerPayment,
  togglePaymentSchema,
} from "@/server/services/payments"

export const Route = createFileRoute("/api/admin/payments/toggle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authSession = await requireAdmin(request, env)
          const body = togglePaymentSchema.parse(await request.json())
          const db = createDb(env.DB)
          const updated = await toggleBillPlayerPayment(
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
