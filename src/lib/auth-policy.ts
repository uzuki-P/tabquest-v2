import { and, asc, eq, isNull } from "drizzle-orm"

import type { Database } from "@/db"
import { players, user } from "@/db/schema"

export type AppRole = "admin" | "user"

export const SHOO_PROVIDER_ID = "shoo"
export const SHOO_DEFAULT_BASE_URL = "https://shoo.dev"

/**
 * Derives the Shoo OIDC `client_id` from the app's public origin (`origin:<url>`),
 * matching Shoo's public-client convention, unless overridden via `SHOO_CLIENT_ID`.
 */
export function deriveShooClientId(
  baseUrl: string | null | undefined,
  explicitClientId?: string | null
): string {
  const custom = explicitClientId?.trim()
  if (custom) return custom

  const candidate = baseUrl?.trim()
  if (candidate) {
    try {
      return `origin:${new URL(candidate).origin}`
    } catch {
      // Fall through to localhost default when BETTER_AUTH_URL is unset/invalid.
    }
  }
  return "origin:http://localhost:3000"
}

/**
 * Normalizes an email address for storage and case-insensitive matching.
 * Persisting lowercase emails ensures `eq(players.email, normalized)` hits
 * `players_email_idx` without a table-scanning `LOWER(...)` expression.
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const trimmed = email.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Strict single-admin check: returns true only when both values are non-empty
 * and match case-insensitively after trimming whitespace.
 */
export function isAdminEmail(
  email: string | null | undefined,
  adminEmail: string | null | undefined
): boolean {
  const normalizedUser = normalizeEmail(email)
  const normalizedAdmin = normalizeEmail(adminEmail)
  if (!normalizedUser || !normalizedAdmin) return false
  return normalizedUser === normalizedAdmin
}

/**
 * Resolves the only permitted Better Auth role for a user based on the strict
 * single `ADMIN_EMAIL` policy.
 */
export function resolveUserRole(
  email: string | null | undefined,
  adminEmail: string | null | undefined
): AppRole {
  return isAdminEmail(email, adminEmail) ? "admin" : "user"
}

export interface SyncOnSignInParams {
  userId: string
  adminEmail: string | null | undefined
  now?: Date
}

export interface SyncOnSignInResult {
  roleUpdated: boolean
  expectedRole: AppRole | null
  attachedPlayerId: string | null
}

/**
 * Runs on verified sign-in (session creation) to:
 * 1. Re-enforce strict single-admin role against the current `ADMIN_EMAIL`.
 * 2. Auto-attach an unlinked `players` row whose lowercase `email` matches
 *    the user's verified email, if the user is not already linked to a player.
 *
 * Uses `db.batch([...])` to minimize D1 round-trips and never issues queries
 * inside a loop.
 */
export async function syncUserRoleAndAttachPlayer(
  db: Database,
  params: SyncOnSignInParams
): Promise<SyncOnSignInResult> {
  const [userRows, linkedPlayerRows] = await db.batch([
    db
      .select({
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, params.userId))
      .limit(1),
    db
      .select({
        id: players.id,
      })
      .from(players)
      .where(eq(players.userId, params.userId))
      .limit(1),
  ])

  const userRow = userRows[0]
  if (!userRow) {
    return {
      roleUpdated: false,
      expectedRole: null,
      attachedPlayerId: null,
    }
  }

  const normalizedEmail = normalizeEmail(userRow.email)
  const expectedRole = resolveUserRole(normalizedEmail, params.adminEmail)
  const needsRoleUpdate = userRow.role !== expectedRole
  const alreadyLinked = linkedPlayerRows.length > 0

  let candidatePlayerId: string | null = null
  if (!alreadyLinked && userRow.emailVerified && normalizedEmail) {
    const candidates = await db
      .select({
        id: players.id,
      })
      .from(players)
      .where(and(eq(players.email, normalizedEmail), isNull(players.userId)))
      .orderBy(asc(players.createdAt))
      .limit(1)

    candidatePlayerId = candidates[0]?.id ?? null
  }

  const now = params.now ?? new Date()
  const writes: Array<
    | ReturnType<ReturnType<Database["update"]>["set"]>
    | ReturnType<
        ReturnType<ReturnType<Database["update"]>["set"]>["where"]
      >
  > = []

  if (needsRoleUpdate) {
    writes.push(
      db
        .update(user)
        .set({
          role: expectedRole,
          updatedAt: now,
        })
        .where(eq(user.id, userRow.id))
    )
  }

  if (candidatePlayerId && normalizedEmail) {
    writes.push(
      db
        .update(players)
        .set({
          userId: userRow.id,
          email: normalizedEmail,
          updatedAt: now.toISOString(),
        })
        .where(and(eq(players.id, candidatePlayerId), isNull(players.userId)))
    )
  }

  if (writes.length === 1) {
    await writes[0]
  } else if (writes.length > 1) {
    const [first, ...rest] = writes
    await db.batch([first, ...rest])
  }

  return {
    roleUpdated: needsRoleUpdate,
    expectedRole,
    attachedPlayerId: candidatePlayerId,
  }
}
