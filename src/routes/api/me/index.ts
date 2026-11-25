import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"

import { createDb, players } from "@/db"
import type { MeResponse } from "@/domain/types"
import { getSession } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import { getPaymentMethods } from "@/server/services/settings"

export const Route = createFileRoute("/api/me/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const authSession = await getSession(request, env)
          if (!authSession) {
            const guestPayload: MeResponse = {
              authenticated: false,
              user: null,
              isAdmin: false,
              linkedPlayerId: null,
              paymentMethods: [],
            }
            return jsonNoStore(guestPayload)
          }

          const db = createDb(env.DB)
          const [linkedRows, paymentMethods] = await Promise.all([
            db
              .select({ id: players.id })
              .from(players)
              .where(eq(players.userId, authSession.user.id))
              .limit(1),
            getPaymentMethods(db),
          ])

          const payload: MeResponse = {
            authenticated: true,
            user: {
              id: authSession.user.id,
              name: authSession.user.name,
              email: authSession.user.email,
              image: authSession.user.image ?? null,
              role: authSession.user.role ?? "user",
            },
            isAdmin: authSession.isAdmin,
            linkedPlayerId: linkedRows[0]?.id ?? null,
            paymentMethods,
          }

          return jsonNoStore(payload)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
