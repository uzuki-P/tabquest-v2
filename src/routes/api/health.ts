import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const d1Check = await env.DB.prepare("SELECT 1 AS ok").first<{
          ok: number
        }>()
        const r2Check = await env.RECEIPTS.list({ limit: 1 })

        return Response.json({
          ok: d1Check?.ok === 1,
          runtime: "cloudflare-workers",
          d1: d1Check?.ok === 1 ? "connected" : "error",
          r2: {
            status: "connected",
            sampleObjects: r2Check.objects.length,
          },
          timestamp: new Date().toISOString(),
        })
      },
    },
  },
})
