import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"

import { requireAdmin } from "@/lib/auth"
import { jsonNoStore, toServiceErrorResponse } from "@/server/services/errors"
import { pollOcrJob } from "@/server/services/ocr"

export const Route = createFileRoute("/api/admin/ocr/jobs/$jobId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          await requireAdmin(request, env)
          const url = new URL(request.url)
          const width = Number(url.searchParams.get("width") ?? 0) || 0
          const height = Number(url.searchParams.get("height") ?? 0) || 0
          const result = await pollOcrJob(env, params.jobId, { width, height })
          return jsonNoStore(result)
        } catch (error) {
          return toServiceErrorResponse(error)
        }
      },
    },
  },
})
