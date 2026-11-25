import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"

import { createDb, players } from "@/db"
import { requireAuth, toAuthErrorResponse } from "@/lib/auth"
import {
  MAX_AVATAR_UPLOAD_BYTES,
  buildAvatarObjectKey,
  extractUploadedBytes,
  validateImageUpload,
} from "@/lib/r2-storage"

export const Route = createFileRoute("/api/me/avatar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let authSession
        try {
          authSession = await requireAuth(request, env)
        } catch (error) {
          const authResponse = toAuthErrorResponse(error)
          if (authResponse) return authResponse
          throw error
        }

        const db = createDb(env.DB)

        // Lookup linked player via unique `players_user_id_uq`.
        const [player] = await db
          .select({
            id: players.id,
            avatarObjectKey: players.avatarObjectKey,
            avatarBanned: players.avatarBanned,
          })
          .from(players)
          .where(eq(players.userId, authSession.user.id))
          .limit(1)

        if (!player) {
          return Response.json(
            { error: "Your account is not linked to a player profile." },
            { status: 403 }
          )
        }

        if (player.avatarBanned) {
          return Response.json(
            { error: "Custom avatar uploads are disabled for this player." },
            { status: 403 }
          )
        }

        const extracted = await extractUploadedBytes(
          request,
          MAX_AVATAR_UPLOAD_BYTES
        )
        if (!extracted.ok) {
          return Response.json(
            { error: extracted.error },
            { status: extracted.status }
          )
        }

        const validated = validateImageUpload(
          extracted.bytes,
          MAX_AVATAR_UPLOAD_BYTES
        )
        if (!validated.ok) {
          return Response.json(
            { error: validated.error },
            { status: validated.status }
          )
        }

        const objectKey = buildAvatarObjectKey(player.id, validated.extension)
        await env.RECEIPTS.put(objectKey, extracted.bytes, {
          httpMetadata: {
            contentType: validated.mediaType,
          },
        })

        try {
          await db
            .update(players)
            .set({
              avatarObjectKey: objectKey,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(players.id, player.id))
        } catch (dbError) {
          // Clean up the newly uploaded orphan object if D1 update fails.
          await env.RECEIPTS.delete(objectKey).catch(() => {})
          throw dbError
        }

        if (player.avatarObjectKey && player.avatarObjectKey !== objectKey) {
          await env.RECEIPTS.delete(player.avatarObjectKey).catch(() => {})
        }

        return Response.json(
          {
            objectKey,
            mediaType: validated.mediaType,
            byteSize: validated.byteSize,
            avatarUrl: `/api/public/players/${player.id}/avatar?v=${encodeURIComponent(objectKey)}`,
          },
          {
            status: 200,
            headers: {
              "Cache-Control": "no-store",
            },
          }
        )
      },
      DELETE: async ({ request }) => {
        let authSession
        try {
          authSession = await requireAuth(request, env)
        } catch (error) {
          const authResponse = toAuthErrorResponse(error)
          if (authResponse) return authResponse
          throw error
        }

        const db = createDb(env.DB)
        const [player] = await db
          .select({
            id: players.id,
            avatarObjectKey: players.avatarObjectKey,
          })
          .from(players)
          .where(eq(players.userId, authSession.user.id))
          .limit(1)

        if (!player) {
          return Response.json(
            { error: "Your account is not linked to a player profile." },
            { status: 403 }
          )
        }

        await db
          .update(players)
          .set({
            avatarObjectKey: null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(players.id, player.id))

        if (player.avatarObjectKey) {
          await env.RECEIPTS.delete(player.avatarObjectKey).catch(() => {})
        }

        return Response.json(
          { removed: true },
          { status: 200, headers: { "Cache-Control": "no-store" } }
        )
      },
    },
  },
})
