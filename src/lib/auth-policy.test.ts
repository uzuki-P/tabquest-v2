import { Database as BunSqlite } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"

import type { Database } from "@/db"
import * as schema from "@/db/schema"
import {
  deriveShooClientId,
  isAdminEmail,
  normalizeEmail,
  resolveUserRole,
  syncUserRoleAndAttachPlayer,
} from "@/lib/auth-policy"

/**
 * Creates an in-memory SQLite database migrated with the real Drizzle SQL
 * migrations and adds a D1-compatible `batch()` method so `syncUserRoleAndAttachPlayer`
 * can be tested end-to-end against actual SQL queries and constraints.
 */
function createTestDb() {
  const sqlite = new BunSqlite(":memory:")
  sqlite.exec("PRAGMA foreign_keys = ON;")

  const migrationsDir = join(process.cwd(), "drizzle")
  const sqlFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()

  for (const file of sqlFiles) {
    const raw = readFileSync(join(migrationsDir, file), "utf8")
    for (const statement of raw.split("--> statement-breakpoint")) {
      const trimmed = statement.trim()
      if (trimmed) sqlite.exec(trimmed)
    }
  }

  const bunDb = drizzle(sqlite, { schema })
  const dbWithBatch = Object.assign(bunDb, {
    async batch(queries: ReadonlyArray<Promise<unknown>>) {
      const results: unknown[] = []
      for (const query of queries) {
        results.push(await query)
      }
      return results
    },
  }) as unknown as Database

  return { sqlite, db: dbWithBatch }
}

describe("auth policy helpers", () => {
  it("normalizes emails by trimming and lowercasing", () => {
    expect(normalizeEmail("  Admin@Example.COM ")).toBe("admin@example.com")
    expect(normalizeEmail("   ")).toBeNull()
    expect(normalizeEmail("")).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })

  it("enforces strict single-admin email matching case-insensitively", () => {
    expect(isAdminEmail("Admin@Example.com", "admin@example.com")).toBe(true)
    expect(isAdminEmail(" admin@example.com ", "ADMIN@EXAMPLE.COM")).toBe(true)
    expect(isAdminEmail("friend@example.com", "admin@example.com")).toBe(false)
    expect(isAdminEmail("admin@example.com", "")).toBe(false)
    expect(isAdminEmail("admin@example.com", undefined)).toBe(false)
    expect(isAdminEmail(null, "admin@example.com")).toBe(false)
  })

  it("resolves admin role only for ADMIN_EMAIL and user for everyone else", () => {
    expect(resolveUserRole("Boss@Tabquest.id", "boss@tabquest.id")).toBe(
      "admin"
    )
    expect(resolveUserRole("player@tabquest.id", "boss@tabquest.id")).toBe(
      "user"
    )
    expect(resolveUserRole("boss@tabquest.id", undefined)).toBe("user")
  })

  it("derives Shoo origin-scoped client_id from BETTER_AUTH_URL or explicit override", () => {
    expect(deriveShooClientId("https://tabquest.example.com/some/path")).toBe(
      "origin:https://tabquest.example.com"
    )
    expect(deriveShooClientId("http://localhost:3000")).toBe(
      "origin:http://localhost:3000"
    )
    expect(deriveShooClientId(undefined)).toBe("origin:http://localhost:3000")
    expect(
      deriveShooClientId("https://tabquest.example.com", "custom-client")
    ).toBe("custom-client")
  })
})

describe("syncUserRoleAndAttachPlayer", () => {
  const now = new Date("2026-11-24T12:00:00.000Z")

  it("promotes ADMIN_EMAIL user and auto-attaches a pre-linked player by lowercase email", async () => {
    const { db } = createTestDb()

    await db.insert(schema.user).values({
      id: "user-admin-1",
      name: "Pajar",
      email: "admin@example.com",
      emailVerified: true,
      role: "user",
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(schema.players).values({
      id: "player-1",
      name: "Pajar",
      email: "admin@example.com",
      userId: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    })

    const result = await syncUserRoleAndAttachPlayer(db, {
      userId: "user-admin-1",
      adminEmail: "ADMIN@EXAMPLE.COM",
      now,
    })

    expect(result).toEqual({
      roleUpdated: true,
      expectedRole: "admin",
      attachedPlayerId: "player-1",
    })

    const [updatedUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "user-admin-1"))
    expect(updatedUser?.role).toBe("admin")

    const [linkedPlayer] = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, "player-1"))
    expect(linkedPlayer?.userId).toBe("user-admin-1")
    expect(linkedPlayer?.email).toBe("admin@example.com")
  })

  it("demotes stale admin accounts that no longer match ADMIN_EMAIL", async () => {
    const { db } = createTestDb()

    await db.insert(schema.user).values({
      id: "user-former-admin",
      name: "Former",
      email: "former@example.com",
      emailVerified: true,
      role: "admin",
      createdAt: now,
      updatedAt: now,
    })

    const result = await syncUserRoleAndAttachPlayer(db, {
      userId: "user-former-admin",
      adminEmail: "current-admin@example.com",
      now,
    })

    expect(result.roleUpdated).toBe(true)
    expect(result.expectedRole).toBe("user")

    const [updatedUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "user-former-admin"))
    expect(updatedUser?.role).toBe("user")
  })

  it("does not auto-attach when emailVerified is false", async () => {
    const { db } = createTestDb()

    await db.insert(schema.user).values({
      id: "user-unverified",
      name: "Unverified",
      email: "friend@example.com",
      emailVerified: false,
      role: "user",
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(schema.players).values({
      id: "player-friend",
      name: "Friend",
      email: "friend@example.com",
      userId: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    })

    const result = await syncUserRoleAndAttachPlayer(db, {
      userId: "user-unverified",
      adminEmail: "admin@example.com",
      now,
    })

    expect(result.attachedPlayerId).toBeNull()

    const [playerRow] = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, "player-friend"))
    expect(playerRow?.userId).toBeNull()
  })

  it("does not attach a second player if user is already linked or player is linked to someone else", async () => {
    const { db } = createTestDb()

    await db.insert(schema.user).values([
      {
        id: "user-1",
        name: "One",
        email: "one@example.com",
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "user-2",
        name: "Two",
        email: "two@example.com",
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
    ])

    await db.insert(schema.players).values([
      {
        id: "player-1-existing",
        name: "One",
        email: "one@example.com",
        userId: "user-1",
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
      {
        id: "player-1-duplicate-email",
        name: "One Duplicate",
        email: "one@example.com",
        userId: null,
        createdAt: "2026-11-02T00:00:00.000Z",
        updatedAt: "2026-11-02T00:00:00.000Z",
      },
      {
        id: "player-taken",
        name: "Taken",
        email: "two@example.com",
        userId: "user-1",
        createdAt: "2026-11-03T00:00:00.000Z",
        updatedAt: "2026-11-03T00:00:00.000Z",
      },
    ]).catch(async () => {
      // players.user_id is UNIQUE, so insert player-taken linked to a third user instead.
      await db.insert(schema.user).values({
        id: "user-3",
        name: "Three",
        email: "three@example.com",
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      })
      await db.insert(schema.players).values([
        {
          id: "player-1-existing",
          name: "One",
          email: "one@example.com",
          userId: "user-1",
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
        {
          id: "player-1-duplicate-email",
          name: "One Duplicate",
          email: "one@example.com",
          userId: null,
          createdAt: "2026-11-02T00:00:00.000Z",
          updatedAt: "2026-11-02T00:00:00.000Z",
        },
        {
          id: "player-taken",
          name: "Taken",
          email: "two@example.com",
          userId: "user-3",
          createdAt: "2026-11-03T00:00:00.000Z",
          updatedAt: "2026-11-03T00:00:00.000Z",
        },
      ])
    })

    const resAlreadyLinked = await syncUserRoleAndAttachPlayer(db, {
      userId: "user-1",
      adminEmail: "admin@example.com",
      now,
    })
    expect(resAlreadyLinked.attachedPlayerId).toBeNull()

    const resTaken = await syncUserRoleAndAttachPlayer(db, {
      userId: "user-2",
      adminEmail: "admin@example.com",
      now,
    })
    expect(resTaken.attachedPlayerId).toBeNull()
  })
})
