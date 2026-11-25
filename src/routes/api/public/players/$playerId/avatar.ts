import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"

import { createDb, players } from "@/db"
import {
  PUBLIC_AVATAR_CACHE_CONTROL,
  buildR2ImageResponse,
} from "@/lib/r2-storage"

export const Route = createFileRoute("/api/public/players/$playerId/avatar")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const db = createDb(env.DB)

        const [player] = await db
          .select({
            userId: players.userId,
            avatarObjectKey: players.avatarObjectKey,
            avatarBanned: players.avatarBanned,
          })
          .from(players)
          .where(eq(players.id, params.playerId))
          .limit(1)

        if (
          !player ||
          !player.userId ||
          !player.avatarObjectKey ||
          player.avatarBanned
        ) {
          return Response.json(
            { error: "Player avatar not found." },
            { status: 404 }
          )
        }

        const object = await env.RECEIPTS.get(player.avatarObjectKey)
        if (!object) {
          return Response.json(
            { error: "Player avatar not found." },
            { status: 404 }
          )
        }

        return buildR2ImageResponse(request, object, {
          cacheControl: PUBLIC_AVATAR_CACHE_CONTROL,
        })
      },
    },
  },
})
