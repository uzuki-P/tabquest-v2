import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { createDb } from "@/db"
import { requireAdmin } from "@/lib/auth"
import {
  deleteDraftBill,
  getAdminBillDetail,
  publishBill,
  setBillArchived,
  unpublishBill,
  updateBill,
} from "@/server/services/bills"
import {
  ServiceError,
  jsonNoStore,
  toServiceErrorResponse,
} from "@/server/services/errors"

export const Route = createFileRoute("/api/admin/bills/$billId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          await requireAdmin(request, env)
          const db = createDb(env.DB)
          const detail = await getAdminBillDetail(db, params.billId)
          return jsonNoStore(detail)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
      PATCH: async ({ request, params }) => {
        try {
          await requireAdmin(request, env)
          const body = (await request.json()) as Record<string, unknown>
          const db = createDb(env.DB)

          if (body.action === "publish") {
            const res = await publishBill(db, params.billId)
            return jsonNoStore(res)
          }
          if (body.action === "unpublish") {
            const res = await unpublishBill(db, params.billId)
            return jsonNoStore(res)
          }
          if (body.action === "archive") {
            const res = await setBillArchived(db, params.billId, true)
            return jsonNoStore(res)
          }
          if (body.action === "unarchive") {
            const res = await setBillArchived(db, params.billId, false)
            return jsonNoStore(res)
          }
          if (typeof body.merchant === "string") {
            const res = await updateBill(
              db,
              params.billId,
              body as Parameters<typeof updateBill>[2]
            )
            return jsonNoStore(res)
          }

          throw new ServiceError(
            400,
            "INVALID_ACTION",
            "Specify an action (publish, unpublish, archive, unarchive) or a bill update payload."
          )
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          await requireAdmin(request, env)
          const db = createDb(env.DB)
          const res = await deleteDraftBill(db, env.RECEIPTS, params.billId)
          return jsonNoStore(res)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
