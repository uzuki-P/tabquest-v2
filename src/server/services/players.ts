import { and, asc, eq, ne } from "drizzle-orm"
import { uuidv7 } from "uuidv7"
import { z } from "zod"

import type { Database } from "@/db"
import { players, user } from "@/db/schema"
import type { AdminUserSummary } from "@/domain/types"
import { makePlayerHandle, makePlayerInitials } from "@/domain/types"
import { normalizeEmail } from "@/lib/auth-policy"
import { nowUtcIso } from "@/lib/time"

import { ServiceError } from "./errors"

export const createPlayerSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  phone: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(240).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
})

export const updatePlayerSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  note: z.string().trim().max(240).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  archived: z.boolean().optional(),
  userId: z.string().trim().min(1).nullable().optional(),
  takesRounding: z.boolean().optional(),
  avatarBanned: z.boolean().optional(),
  nameLocked: z.boolean().optional(),
  removeAvatar: z.boolean().optional(),
})

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>

export interface AdminPlayerRow {
  id: string
  name: string
  handle: string
  avatar: string
  avatarUrl: string | null
  avatarBanned: boolean
  nameLocked: boolean
  phone: string | null
  note: string | null
  email: string | null
  userId: string | null
  userEmail: string | null
  userName: string | null
  takesRounding: boolean
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export function buildAvatarPublicUrl(
  playerId: string,
  avatarObjectKey: string | null
): string | null {
  if (!avatarObjectKey) return null
  return `/api/public/players/${playerId}/avatar?v=${encodeURIComponent(avatarObjectKey)}`
}

/**
 * Lists all players (active + archived) and all Better Auth users in one D1 batch
 * so the Admin Players screen can manage pre-links, account links, rounding flag,
 * and avatar moderation.
 */
export async function listAdminPlayers(db: Database): Promise<{
  players: AdminPlayerRow[]
  users: AdminUserSummary[]
}> {
  const [playerRows, userRows] = await db.batch([
    db
      .select()
      .from(players)
      .orderBy(asc(players.name)),
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      })
      .from(user)
      .orderBy(asc(user.email)),
  ])

  const userById = new Map(userRows.map((u) => [u.id, u]))

  return {
    players: playerRows.map((p) => {
      const linkedUser = p.userId ? userById.get(p.userId) : undefined
      return {
        id: p.id,
        name: p.name,
        handle: makePlayerHandle(p.name),
        avatar: makePlayerInitials(p.name),
        avatarUrl: buildAvatarPublicUrl(p.id, p.avatarObjectKey),
        avatarBanned: p.avatarBanned,
        nameLocked: p.nameLocked,
        phone: p.phone,
        note: p.note,
        email: p.email,
        userId: p.userId,
        userEmail: linkedUser?.email ?? null,
        userName: linkedUser?.name ?? null,
        takesRounding: p.takesRounding,
        archivedAt: p.archivedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }
    }),
    users: userRows,
  }
}

/**
 * Creates a directory player. Always normalizes `email` to lowercase so
 * `eq(players.email, ...)` hits `players_email_idx`.
 */
export async function createPlayer(
  db: Database,
  rawInput: CreatePlayerInput
): Promise<AdminPlayerRow> {
  const input = createPlayerSchema.parse(rawInput)
  const now = nowUtcIso()
  const id = uuidv7()
  const normalizedEmail = normalizeEmail(input.email)

  await db.insert(players).values({
    id,
    name: input.name,
    phone: input.phone?.trim() || null,
    note: input.note?.trim() || null,
    email: normalizedEmail,
    userId: null,
    takesRounding: false,
    avatarObjectKey: null,
    avatarBanned: false,
    nameLocked: false,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  })

  return {
    id,
    name: input.name,
    handle: makePlayerHandle(input.name),
    avatar: makePlayerInitials(input.name),
    avatarUrl: null,
    avatarBanned: false,
    nameLocked: false,
    phone: input.phone?.trim() || null,
    note: input.note?.trim() || null,
    email: normalizedEmail,
    userId: null,
    userEmail: null,
    userName: null,
    takesRounding: false,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Updates player fields, pre-link email (lowercase normalized), Better Auth user
 * link/unlink, single-admin `takesRounding` flag, archive toggle, and avatar
 * moderation (with R2 cleanup when removing or banning an avatar).
 */
export async function updatePlayer(
  db: Database,
  r2: R2Bucket | null,
  playerId: string,
  rawInput: UpdatePlayerInput
): Promise<AdminPlayerRow> {
  const input = updatePlayerSchema.parse(rawInput)

  const [existing] = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1)

  if (!existing) {
    throw new ServiceError(404, "PLAYER_NOT_FOUND", "Player not found.")
  }

  // Validate userId if linking to a Better Auth user
  let linkedUser: { id: string; name: string; email: string } | null = null
  if (input.userId !== undefined && input.userId !== null) {
    const [targetUsers, conflictPlayers] = await db.batch([
      db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1),
      db
        .select({ id: players.id, name: players.name })
        .from(players)
        .where(
          and(eq(players.userId, input.userId), ne(players.id, playerId))
        )
        .limit(1),
    ])

    if (!targetUsers[0]) {
      throw new ServiceError(404, "USER_NOT_FOUND", "User account not found.")
    }
    if (conflictPlayers[0]) {
      throw new ServiceError(
        409,
        "USER_ALREADY_LINKED",
        `That account is already linked to ${conflictPlayers[0].name}.`
      )
    }
    linkedUser = targetUsers[0]
  } else if (input.userId === undefined && existing.userId) {
    const [u] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, existing.userId))
      .limit(1)
    linkedUser = u ?? null
  }

  const now = nowUtcIso()
  const nextEmail =
    input.email !== undefined ? normalizeEmail(input.email) : existing.email
  const nextArchivedAt =
    input.archived !== undefined
      ? input.archived
        ? (existing.archivedAt ?? now)
        : null
      : existing.archivedAt
  const nextUserId =
    input.userId !== undefined ? input.userId : existing.userId
  const nextAvatarBanned =
    input.avatarBanned !== undefined
      ? input.avatarBanned
      : existing.avatarBanned
  const nextNameLocked =
    input.nameLocked !== undefined ? input.nameLocked : existing.nameLocked

  const shouldClearAvatar =
    Boolean(input.removeAvatar) || input.avatarBanned === true
  const oldAvatarKey = shouldClearAvatar ? existing.avatarObjectKey : null
  const nextAvatarObjectKey = shouldClearAvatar
    ? null
    : existing.avatarObjectKey

  const nextTakesRounding =
    input.takesRounding !== undefined
      ? input.takesRounding
      : existing.takesRounding

  const updateSet = {
    name: input.name !== undefined ? input.name : existing.name,
    phone:
      input.phone !== undefined
        ? input.phone?.trim() || null
        : existing.phone,
    note:
      input.note !== undefined ? input.note?.trim() || null : existing.note,
    email: nextEmail,
    archivedAt: nextArchivedAt,
    userId: nextUserId,
    takesRounding: nextTakesRounding,
    avatarBanned: nextAvatarBanned,
    nameLocked: nextNameLocked,
    avatarObjectKey: nextAvatarObjectKey,
    updatedAt: now,
  }

  if (input.takesRounding === true) {
    // Enforce single `takesRounding` player atomically via db.batch
    await db.batch([
      db
        .update(players)
        .set({ takesRounding: false, updatedAt: now })
        .where(
          and(eq(players.takesRounding, true), ne(players.id, playerId))
        ),
      db
        .update(players)
        .set(updateSet)
        .where(eq(players.id, playerId)),
    ])
  } else {
    await db
      .update(players)
      .set(updateSet)
      .where(eq(players.id, playerId))
  }

  if (oldAvatarKey && r2) {
    await r2.delete(oldAvatarKey).catch(() => {})
  }

  return {
    id: playerId,
    name: updateSet.name,
    handle: makePlayerHandle(updateSet.name),
    avatar: makePlayerInitials(updateSet.name),
    avatarUrl: buildAvatarPublicUrl(playerId, updateSet.avatarObjectKey),
    avatarBanned: updateSet.avatarBanned,
    nameLocked: updateSet.nameLocked,
    phone: updateSet.phone,
    note: updateSet.note,
    email: updateSet.email,
    userId: updateSet.userId,
    userEmail: linkedUser?.email ?? null,
    userName: linkedUser?.name ?? null,
    takesRounding: updateSet.takesRounding,
    archivedAt: updateSet.archivedAt,
    createdAt: existing.createdAt,
    updatedAt: now,
  }
}
