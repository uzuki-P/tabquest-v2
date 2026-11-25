import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAdmin } from "@/lib/auth"
import {
  createBill,
  listAdminBills,
  upsertBillSchema,
} from "@/server/services/bills"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"

export const Route = createFileRoute("/api/admin/bills/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request, env)
          const db = createDb(env.DB)
          const data = await listAdminBills(db)
          return jsonNoStore(data)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
      POST: async ({ request }) => {
        try {
          await requireAdmin(request, env)
          const body = upsertBillSchema.parse(await request.json())
          const db = createDb(env.DB)
          const result = await createBill(db, body)
          return jsonNoStore(result, 201)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
