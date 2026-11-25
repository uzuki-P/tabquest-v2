import { env } from "cloudflare:workers"
import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { createDb, players } from "@/db"
import { makePlayerHandle, makePlayerInitials } from "@/domain/types"
import { requireAuth, toAuthErrorResponse } from "@/lib/auth"
import { nowUtcIso } from "@/lib/time"

const updateMyProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Username cannot be empty.")
    .max(40, "Username must be 40 characters or fewer."),
})

export const Route = createFileRoute("/api/me/profile")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        let authSession
        try {
          authSession = await requireAuth(request, env)
        } catch (error) {
          const authResponse = toAuthErrorResponse(error)
          if (authResponse) return authResponse
          throw error
        }

        let parsed
        try {
          parsed = updateMyProfileSchema.parse(await request.json())
        } catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json(
              { error: error.issues[0]?.message ?? "Invalid name." },
              { status: 400 }
            )
          }
          return Response.json(
            { error: "Invalid request body." },
            { status: 400 }
          )
        }

        const db = createDb(env.DB)

        // Lookup linked player via unique `players_user_id_uq`.
        const [player] = await db
          .select({
            id: players.id,
            nameLocked: players.nameLocked,
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

        if (player.nameLocked) {
          return Response.json(
            { error: "Your name is locked by an admin." },
            { status: 403 }
          )
        }

        const now = nowUtcIso()
        await db
          .update(players)
          .set({
            name: parsed.name,
            updatedAt: now,
          })
          .where(eq(players.id, player.id))

        return Response.json(
          {
            id: player.id,
            name: parsed.name,
            handle: makePlayerHandle(parsed.name),
            avatar: makePlayerInitials(parsed.name),
            nameLocked: false,
          },
          {
            status: 200,
            headers: { "Cache-Control": "no-store" },
          }
        )
      },
    },
  },
})
