import { Database as BunSqlite } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"

import type { Database } from "@/db"
import * as schema from "@/db/schema"
import {
  createBill,
  deleteDraftBill,
  getAdminBillDetail,
  getPublicBillDetail,
  listAdminBills,
  publishBill,
  setBillArchived,
  updateBill,
} from "@/server/services/bills"
import { ServiceError } from "@/server/services/errors"
import { pollOcrJob, submitOcrJob } from "@/server/services/ocr"
import {
  collectAllForPlayer,
  createTransferClaimForUser,
  dismissTransferClaim,
  toggleBillPlayerPayment,
} from "@/server/services/payments"
import {
  createPlayer,
  linkMyPlayer,
  listAdminPlayers,
  updatePlayer,
} from "@/server/services/players"
import {
  computeLatestStandingChange,
  computeMonthlyBadgesByPlayer,
  getHomeFeed,
  getPlayerDetail,
  getRanksFeed,
  getTipWall,
} from "@/server/services/queries"
import {
  getAdminSettings,
  getPaymentMethods,
  getPublicSettings,
  updateAppSettings,
} from "@/server/services/settings"

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

function createFakeR2() {
  const store = new Map<string, Uint8Array>()
  const deletedKeys: string[] = []
  const bucket = {
    async put(key: string, value: Uint8Array) {
      store.set(key, value)
    },
    async delete(key: string) {
      deletedKeys.push(key)
      store.delete(key)
    },
  } as unknown as R2Bucket
  return { bucket, store, deletedKeys }
}

describe("Phase 4 D1 services", () => {
  it("normalizes player emails to lowercase, enforces single takesRounding, and cleans R2 on avatar ban", async () => {
    const { db } = createTestDb()
    const { bucket, deletedKeys } = createFakeR2()

    const alice = await createPlayer(db, {
      name: "Alice",
      email: "  ALICE@Example.COM  ",
    })
    const bob = await createPlayer(db, {
      name: "Bob",
      email: "bob@example.com",
    })

    expect(alice.email).toBe("alice@example.com")

    await updatePlayer(db, bucket, alice.id, { takesRounding: true })
    await updatePlayer(db, bucket, bob.id, { takesRounding: true })

    // Give Alice an avatar object key, then ban her avatar
    await db
      .update(schema.players)
      .set({ avatarObjectKey: "avatars/alice-old.webp" })
      .where(eq(schema.players.id, alice.id))

    const moderated = await updatePlayer(db, bucket, alice.id, {
      avatarBanned: true,
      email: "  Alice.New@Example.COM ",
    })

    expect(moderated.email).toBe("alice.new@example.com")
    expect(moderated.avatarBanned).toBe(true)
    expect(moderated.avatarUrl).toBeNull()
    expect(deletedKeys).toEqual(["avatars/alice-old.webp"])

    const list = await listAdminPlayers(db)
    const roundingPlayers = list.players.filter((p) => p.takesRounding)
    expect(roundingPlayers.map((p) => p.id)).toEqual([bob.id])
  })

  it("gates payment methods out of public settings while persisting branding + payment methods", async () => {
    const { db } = createTestDb()

    const updated = await updateAppSettings(
      db,
      {
        appName: "SquadTab",
        tagline: "Lunch splits",
        iconUrl: "/custom.png",
        paymentMethods: [
          {
            id: "pm-1",
            type: "bank",
            label: "BCA",
            accountNumber: "1234567890",
            accountHolder: "Admin",
            note: "BI-FAST",
            isPrimary: true,
          },
        ],
      },
      "admin@example.com"
    )

    expect(updated.branding.appName).toBe("SquadTab")
    expect(updated.paymentMethods).toHaveLength(1)

    const pub = await getPublicSettings(db)
    expect(pub).toEqual({
      appName: "SquadTab",
      tagline: "Lunch splits",
      iconUrl: "/custom.png",
    })
    expect("paymentMethods" in pub).toBe(false)

    const authMethods = await getPaymentMethods(db)
    expect(authMethods).toHaveLength(1)
    expect(authMethods[0]?.accountNumber).toBe("1234567890")

    const adminSettings = await getAdminSettings(db)
    expect(adminSettings.updatedBy).toBe("admin@example.com")
  })

  it("persists computeSplit snapshots on bill publish and fixes rounding_bill_player_id", async () => {
    const { db } = createTestDb()

    const adminPlayer = await createPlayer(db, { name: "AdminP" })
    const guestA = await createPlayer(db, { name: "GuestA" })
    const guestB = await createPlayer(db, { name: "GuestB" })
    await updatePlayer(db, null, adminPlayer.id, { takesRounding: true })

    // Create draft first
    const draft = await createBill(db, {
      merchant: "Kopi Tuku",
      title: "Morning Coffee",
      orderDate: "2026-11-20",
      publish: false,
      items: [
        { id: "it-1", name: "Kopi Susu", quantity: 3, bundleSize: 1, unitPrice: 20000 },
      ],
      adjustments: [
        // 1000 fee split 3 ways = 333, 333, 333 + 1 leftover -> adminPlayer takes +1 = 334
        { id: "adj-1", type: "delivery", label: "Delivery", signedAmount: 1000 },
      ],
      billPlayers: [
        { id: guestA.id, playerId: guestA.id, alias: "GuestA" },
        { id: guestB.id, playerId: guestB.id, alias: "GuestB" },
        { id: adminPlayer.id, playerId: adminPlayer.id, alias: "AdminP" },
      ],
      allocations: [
        { itemKey: "it-1", billPlayerKey: guestA.id, quantity: 1 },
        { itemKey: "it-1", billPlayerKey: guestB.id, quantity: 1 },
        { itemKey: "it-1", billPlayerKey: adminPlayer.id, quantity: 1 },
      ],
    })

    expect(draft.status).toBe("draft")

    // Draft must not be visible on public detail
    await expect(getPublicBillDetail(db, draft.publicId)).rejects.toBeInstanceOf(
      ServiceError
    )

    // Publish the draft
    const pubRes = await publishBill(db, draft.id)
    expect(pubRes.status).toBe("published")
    expect(pubRes.roundingBillPlayerId).toBeTruthy()

    const detail = await getPublicBillDetail(db, draft.publicId)
    expect(detail.bill.finalTotal).toBe(61000)
    const adminSplit = detail.bill.splits.find((s) => s.playerId === adminPlayer.id)
    const aSplit = detail.bill.splits.find((s) => s.playerId === guestA.id)
    expect(adminSplit?.totalOwed).toBe(20334)
    expect(aSplit?.totalOwed).toBe(20333)

    // Archive & unarchive
    await setBillArchived(db, draft.id, true)
    const adminList = await listAdminBills(db)
    expect(adminList.archived).toHaveLength(1)
    expect(adminList.active).toHaveLength(0)

    await setBillArchived(db, draft.id, false)

    // Cannot delete published bill
    await expect(deleteDraftBill(db, null, draft.id)).rejects.toBeInstanceOf(
      ServiceError
    )
  })

  it("updates an existing bill while preserving paid payment statuses and existing receipt image", async () => {
    const { db } = createTestDb()

    const alice = await createPlayer(db, { name: "Alice" })
    const bob = await createPlayer(db, { name: "Bob" })
    const carol = await createPlayer(db, { name: "Carol" })

    const created = await createBill(db, {
      merchant: "Bakmi GM",
      title: "Lunch",
      orderDate: "2026-11-21",
      publish: true,
      imageObjectKey: "receipts/bakmi-1.webp",
      imageMediaType: "image/webp",
      imageByteSize: 12345,
      items: [
        { id: "it-1", name: "Bakmi Ayam", quantity: 2, bundleSize: 1, unitPrice: 30000 },
      ],
      adjustments: [],
      billPlayers: [
        { id: alice.id, playerId: alice.id, alias: "Alice" },
        { id: bob.id, playerId: bob.id, alias: "Bob" },
      ],
      allocations: [
        { itemKey: "it-1", billPlayerKey: alice.id, quantity: 1 },
        { itemKey: "it-1", billPlayerKey: bob.id, quantity: 1 },
      ],
    })

    const initialDetail = await getAdminBillDetail(db, created.id)
    const aliceBp = initialDetail.billPlayers.find((bp) => bp.playerId === alice.id)
    expect(aliceBp).toBeDefined()

    // Mark Alice as paid
    await toggleBillPlayerPayment(
      db,
      { billPlayerId: aliceBp!.id, status: "paid", paidAmount: 30000 },
      "admin@example.com"
    )

    // Edit the bill: change merchant, add Carol, add delivery fee, omit image fields
    const updated = await updateBill(db, created.id, {
      merchant: "Bakmi GM Kemang",
      title: "Friday Lunch",
      orderDate: "2026-11-21",
      publish: true,
      items: [
        { id: "it-1", name: "Bakmi Ayam", quantity: 3, bundleSize: 1, unitPrice: 30000 },
      ],
      adjustments: [
        { id: "adj-1", type: "delivery", label: "Delivery", signedAmount: 9000 },
      ],
      billPlayers: [
        { id: alice.id, playerId: alice.id, alias: "Alice" },
        { id: bob.id, playerId: bob.id, alias: "Bob" },
        { id: carol.id, playerId: carol.id, alias: "Carol" },
      ],
      allocations: [
        { itemKey: "it-1", billPlayerKey: alice.id, quantity: 1 },
        { itemKey: "it-1", billPlayerKey: bob.id, quantity: 1 },
        { itemKey: "it-1", billPlayerKey: carol.id, quantity: 1 },
      ],
    })

    expect(updated.status).toBe("published")
    expect(updated.finalTotal).toBe(99000)

    const afterAdmin = await getAdminBillDetail(db, created.id)
    expect(afterAdmin.bill.merchant).toBe("Bakmi GM Kemang")
    expect(afterAdmin.bill.imageObjectKey).toBe("receipts/bakmi-1.webp")

    const afterPublic = await getPublicBillDetail(db, created.publicId)
    expect(afterPublic.bill.splits).toHaveLength(3)
    const aliceSplit = afterPublic.bill.splits.find((s) => s.playerId === alice.id)
    const bobSplit = afterPublic.bill.splits.find((s) => s.playerId === bob.id)
    const carolSplit = afterPublic.bill.splits.find((s) => s.playerId === carol.id)

    expect(aliceSplit?.status).toBe("paid")
    expect(aliceSplit?.paidAmount).toBe(30000)
    expect(aliceSplit?.totalOwed).toBe(33000)
    expect(bobSplit?.status).toBe("unpaid")
    expect(bobSplit?.totalOwed).toBe(33000)
    expect(carolSplit?.status).toBe("unpaid")
    expect(carolSplit?.totalOwed).toBe(33000)
  })

  it("handles transfer claims (linked users only) and Admin Collect All with optimistic guard & tip attribution", async () => {
    const { db } = createTestDb()
    const now = new Date("2026-11-24T12:00:00.000Z")

    await db.insert(schema.user).values([
      {
        id: "u-linked",
        name: "Bima",
        email: "bima@example.com",
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "u-unlinked",
        name: "Stranger",
        email: "stranger@example.com",
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
    ])

    const bima = await createPlayer(db, { name: "Bima", email: "bima@example.com" })
    await updatePlayer(db, null, bima.id, { userId: "u-linked" })

    // Create 2 published bills on different dates so the newer bill absorbs the tip
    const bill1 = await createBill(db, {
      merchant: "Bakmi GM",
      orderDate: "2026-11-20",
      publish: true,
      items: [{ id: "i1", name: "Bakmi", quantity: 1, bundleSize: 1, unitPrice: 30000 }],
      adjustments: [],
      billPlayers: [{ id: bima.id, playerId: bima.id, alias: "Bima" }],
      allocations: [{ itemKey: "i1", billPlayerKey: bima.id, quantity: 1 }],
    })

    const bill2 = await createBill(db, {
      merchant: "Kopi Tuku",
      orderDate: "2026-11-22",
      publish: true,
      items: [{ id: "i2", name: "Kopi", quantity: 1, bundleSize: 1, unitPrice: 25000 }],
      adjustments: [],
      billPlayers: [{ id: bima.id, playerId: bima.id, alias: "Bima" }],
      allocations: [{ itemKey: "i2", billPlayerKey: bima.id, quantity: 1 }],
    })

    // Unlinked user cannot create a transfer claim (403)
    await expect(
      createTransferClaimForUser(db, "u-unlinked", { claimedAmount: 60000 })
    ).rejects.toMatchObject({ status: 403, code: "PLAYER_NOT_LINKED" })

    // Linked user creates a pending transfer claim
    const claim = await createTransferClaimForUser(db, "u-linked", {
      claimedAmount: 60000,
    })
    expect(claim.status).toBe("pending")
    expect(claim.expectedOwedAtClaim).toBe(55000)
    expect(claim.billPlayerIds).toHaveLength(2)

    // Dismissing then re-claiming works cleanly
    await dismissTransferClaim(
      db,
      { playerId: bima.id, claimId: claim.id },
      "admin@example.com"
    )
    const claim2 = await createTransferClaimForUser(db, "u-linked", {
      claimedAmount: 60000,
    })
    expect(claim2.status).toBe("pending")

    // Admin Collect All settles both bills, logs +5000 tip on bill2 (most recent), confirms claim
    const collected = await collectAllForPlayer(
      db,
      { playerId: bima.id, receivedAmount: 60000 },
      "admin@example.com"
    )
    expect(collected.settledCount).toBe(2)
    expect(collected.totalOwed).toBe(55000)
    expect(collected.tipAmount).toBe(5000)
    expect(collected.confirmedClaimIds).toContain(claim2.id)

    // Optimistic guard: calling Collect All again rejects with NOTHING_TO_COLLECT
    await expect(
      collectAllForPlayer(
        db,
        { playerId: bima.id, receivedAmount: 60000 },
        "admin@example.com"
      )
    ).rejects.toMatchObject({ status: 409, code: "NOTHING_TO_COLLECT" })

    // Verify bill1 paid exact (30000) and bill2 paid share + tip (30000 = 25000 + 5000)
    const d1 = await getPublicBillDetail(db, bill1.publicId)
    const d2 = await getPublicBillDetail(db, bill2.publicId)
    expect(d1.bill.splits[0]?.paidAmount).toBe(30000)
    expect(d2.bill.splits[0]?.paidAmount).toBe(30000)

    // Verify summary queries (Home, Ranks, Tip Wall, Player Detail) reflect tip & zero unpaid
    const home = await getHomeFeed(db, "2026-11")
    expect(home.totals.totalTipPot).toBe(5000)
    expect(home.totals.totalOutstanding).toBe(0)

    const ranks = await getRanksFeed(db, "all-time", "2026-11")
    expect(ranks.totalTipPot).toBe(5000)

    const tips = await getTipWall(db, "2026-11")
    expect(tips.tippers).toHaveLength(1)
    expect(tips.tippers[0]?.monthlyTips).toBe(5000)

    const dossier = await getPlayerDetail(db, bima.id, "2026-11")
    expect(dossier.costBreakdown.netBills).toBe(55000)
    expect(dossier.costBreakdown.tips).toBe(5000)
    expect(dossier.orderHistory).toHaveLength(2)

    // Toggle single payment back to unpaid
    const bpId = d2.bill.splits[0]!.billPlayerId
    const toggled = await toggleBillPlayerPayment(
      db,
      { billPlayerId: bpId, status: "unpaid" },
      "admin@example.com"
    )
    expect(toggled.status).toBe("unpaid")
  })

  it("returns 503 OCR_NOT_CONFIGURED when vision-api env vars are missing, and proxies headers when set", async () => {
    await expect(
      submitOcrJob(
        {},
        { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/jpeg", width: 100, height: 100 }
      )
    ).rejects.toMatchObject({ status: 503, code: "OCR_NOT_CONFIGURED" })

    let capturedHeaders: Record<string, string> = {}
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>
      return Response.json({
        id: "job-123",
        status: "completed",
        response: {
          result: JSON.stringify({
            merchant: "Kopi Tuku",
            orderDate: "2026-11-24",
            items: [
              { name: "Es Kopi", variantNotes: "", quantity: 1, unitPrice: 20000 },
            ],
            adjustments: [],
            sourceSubtotal: 20000,
            finalTotal: 20000,
            redactions: [],
          }),
        },
      })
    }) as unknown as typeof fetch

    const envCfg = {
      VISION_API_URL: "https://vision.example.com",
      VISION_API_TOKEN: "secret-token",
      CF_ACCESS_CLIENT_ID: "cf-id",
      CF_ACCESS_CLIENT_SECRET: "cf-secret",
    }

    const submitted = await submitOcrJob(
      envCfg,
      { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mediaType: "image/jpeg", width: 800, height: 1200 },
      fakeFetch
    )
    expect(submitted.jobId).toBe("job-123")
    expect(capturedHeaders.Authorization).toBe("Bearer secret-token")
    expect(capturedHeaders["CF-Access-Client-Id"]).toBe("cf-id")
    expect(capturedHeaders["CF-Access-Client-Secret"]).toBe("cf-secret")

    const polled = await pollOcrJob(
      envCfg,
      "job-123",
      { width: 800, height: 1200 },
      fakeFetch
    )
    expect(polled.status).toBe("completed")
    expect(polled.receipt?.merchant).toBe("Kopi Tuku")
  })

  it("allows unlinked signed-in users to self-link to an active unlinked player while blocking hijacks and reserved emails", async () => {
    const { db } = createTestDb()
    const now = new Date("2026-11-26T10:00:00.000Z")

    await db.insert(schema.user).values([
      {
        id: "user-a",
        name: "Alice",
        email: "alice@example.com",
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "user-b",
        name: "Bob",
        email: "bob@example.com",
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
    ])

    const alicePlayer = await createPlayer(db, { name: "Alice" })
    const bobPlayer = await createPlayer(db, { name: "Bob" })
    const reservedPlayer = await createPlayer(db, {
      name: "Charlie",
      email: "charlie@example.com",
    })
    const archivedPlayer = await createPlayer(db, { name: "Oldie" })
    await updatePlayer(db, null, archivedPlayer.id, { archived: true })

    // Cannot claim a player reserved for another email
    await expect(
      linkMyPlayer(db, {
        userId: "user-a",
        userEmail: "ALICE@example.com",
        playerId: reservedPlayer.id,
      })
    ).rejects.toMatchObject({ status: 409, code: "PLAYER_PRELINKED_OTHER_EMAIL" })

    // Cannot claim an archived player
    await expect(
      linkMyPlayer(db, {
        userId: "user-a",
        userEmail: "alice@example.com",
        playerId: archivedPlayer.id,
      })
    ).rejects.toMatchObject({ status: 400, code: "PLAYER_ARCHIVED" })

    // Unknown player -> 404
    await expect(
      linkMyPlayer(db, {
        userId: "user-a",
        userEmail: "alice@example.com",
        playerId: "missing-player-id",
      })
    ).rejects.toMatchObject({ status: 404, code: "PLAYER_NOT_FOUND" })

    // Happy path: Alice self-links
    const linked = await linkMyPlayer(db, {
      userId: "user-a",
      userEmail: "  ALICE@Example.COM ",
      playerId: alicePlayer.id,
    })
    expect(linked).toEqual({
      linkedPlayerId: alicePlayer.id,
      playerName: "Alice",
    })

    const [aliceRow] = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, alicePlayer.id))
    expect(aliceRow?.userId).toBe("user-a")
    expect(aliceRow?.email).toBe("alice@example.com")

    // Idempotent repeat call for the same player succeeds
    const repeat = await linkMyPlayer(db, {
      userId: "user-a",
      userEmail: "alice@example.com",
      playerId: alicePlayer.id,
    })
    expect(repeat.linkedPlayerId).toBe(alicePlayer.id)

    // Already linked user cannot switch to another player
    await expect(
      linkMyPlayer(db, {
        userId: "user-a",
        userEmail: "alice@example.com",
        playerId: bobPlayer.id,
      })
    ).rejects.toMatchObject({ status: 409, code: "ACCOUNT_ALREADY_LINKED" })

    // Another user cannot hijack Alice's linked player
    await expect(
      linkMyPlayer(db, {
        userId: "user-b",
        userEmail: "bob@example.com",
        playerId: alicePlayer.id,
      })
    ).rejects.toMatchObject({ status: 409, code: "PLAYER_ALREADY_LINKED" })
  })

  it("computes monthly #1 spending and tipping badges in a single pass with alphabetical tie-breaks", () => {
    const players = [
      { id: "p-zoe", name: "Zoe" },
      { id: "p-amy", name: "Amy" },
      { id: "p-ben", name: "Ben" },
    ]
    const bills = [
      // Month with a 2-way tie on spend (Zoe vs Amy -> Amy wins alphabetically) and clear tip winner (Ben)
      { id: "b-nov-1", orderDate: "2026-11-10" },
      // Month where Zoe wins both spend and tips (outside sticker window -> stickerSrc null)
      { id: "b-jul-1", orderDate: "2026-07-15" },
      // Month with zero spend and zero tips -> no badges awarded
      { id: "b-oct-1", orderDate: "2026-10-05" },
    ]
    const splits = [
      // Nov 2026: Zoe and Amy tie at 50_000 spend; Ben tips 5_000; Zoe unpaid so paidAmount ignored
      {
        billId: "b-nov-1",
        playerId: "p-zoe",
        shareAmount: 50000,
        paymentStatus: "unpaid",
        paidAmount: 99000,
      },
      {
        billId: "b-nov-1",
        playerId: "p-amy",
        shareAmount: 50000,
        paymentStatus: "paid",
        paidAmount: 50000,
      },
      {
        billId: "b-nov-1",
        playerId: "p-ben",
        shareAmount: 20000,
        paymentStatus: "paid",
        paidAmount: 25000,
      },
      // Jul 2026: Zoe wins both spend and tips
      {
        billId: "b-jul-1",
        playerId: "p-zoe",
        shareAmount: 40000,
        paymentStatus: "paid",
        paidAmount: 43000,
      },
      // Oct 2026: zero shareAmount, zero tips
      {
        billId: "b-oct-1",
        playerId: "p-amy",
        shareAmount: 0,
        paymentStatus: "paid",
        paidAmount: 0,
      },
    ]

    const result = computeMonthlyBadgesByPlayer({ players, bills, splits })

    expect(result.get("p-amy")).toEqual([
      {
        kind: "spending",
        monthKey: "2026-11",
        monthLabel: "Nov 2026",
        amount: 50000,
        stickerSrc: "/stickers/player-badges/spending-2026-11.webp",
      },
    ])
    expect(result.get("p-ben")).toEqual([
      {
        kind: "tips",
        monthKey: "2026-11",
        monthLabel: "Nov 2026",
        amount: 5000,
        stickerSrc: "/stickers/player-badges/tips-2026-11.webp",
      },
    ])
    expect(result.get("p-zoe")).toEqual([
      {
        kind: "spending",
        monthKey: "2026-07",
        monthLabel: "Jul 2026",
        amount: 40000,
        stickerSrc: null,
      },
      {
        kind: "tips",
        monthKey: "2026-07",
        monthLabel: "Jul 2026",
        amount: 3000,
        stickerSrc: null,
      },
    ])
  })

  it("exposes currentMonthBadges on feeds and full monthlyBadges history on player detail", async () => {
    const { db } = createTestDb()

    const alice = await createPlayer(db, { name: "Alice" })
    const bob = await createPlayer(db, { name: "Bob" })

    // Oct 2026 bill: Alice is #1 spender, Bob is #1 tipper
    const octBill = await createBill(db, {
      merchant: "Sate Khas",
      orderDate: "2026-10-12",
      publish: true,
      items: [
        { id: "i1", name: "Sate", quantity: 1, bundleSize: 1, unitPrice: 60000 },
        { id: "i2", name: "Teh", quantity: 1, bundleSize: 1, unitPrice: 20000 },
      ],
      adjustments: [],
      billPlayers: [
        { id: alice.id, playerId: alice.id, alias: "Alice" },
        { id: bob.id, playerId: bob.id, alias: "Bob" },
      ],
      allocations: [
        { itemKey: "i1", billPlayerKey: alice.id, quantity: 1 },
        { itemKey: "i2", billPlayerKey: bob.id, quantity: 1 },
      ],
    })
    const octDetail = await getPublicBillDetail(db, octBill.publicId)
    const bobOctSplit = octDetail.bill.splits.find((s) => s.playerId === bob.id)!
    await toggleBillPlayerPayment(
      db,
      {
        billPlayerId: bobOctSplit.billPlayerId,
        status: "paid",
        paidAmount: bobOctSplit.totalOwed + 4000,
      },
      "admin@example.com"
    )

    // Nov 2026 bill: Alice is #1 spender AND #1 tipper
    const novBill = await createBill(db, {
      merchant: "Bakmi GM",
      orderDate: "2026-11-18",
      publish: true,
      items: [
        { id: "i1", name: "Bakmi", quantity: 1, bundleSize: 1, unitPrice: 50000 },
        { id: "i2", name: "Pangsit", quantity: 1, bundleSize: 1, unitPrice: 25000 },
      ],
      adjustments: [],
      billPlayers: [
        { id: alice.id, playerId: alice.id, alias: "Alice" },
        { id: bob.id, playerId: bob.id, alias: "Bob" },
      ],
      allocations: [
        { itemKey: "i1", billPlayerKey: alice.id, quantity: 1 },
        { itemKey: "i2", billPlayerKey: bob.id, quantity: 1 },
      ],
    })
    const novDetail = await getPublicBillDetail(db, novBill.publicId)
    const aliceNovSplit = novDetail.bill.splits.find(
      (s) => s.playerId === alice.id
    )!
    await toggleBillPlayerPayment(
      db,
      {
        billPlayerId: aliceNovSplit.billPlayerId,
        status: "paid",
        paidAmount: aliceNovSplit.totalOwed + 5000,
      },
      "admin@example.com"
    )

    // Home feed defaults to latest month (2026-11)
    const home = await getHomeFeed(db)
    expect(home.month).toBe("2026-11")
    const homeAlice = home.players.find((p) => p.id === alice.id)!
    const homeBob = home.players.find((p) => p.id === bob.id)!
    expect(homeAlice.currentMonthBadges?.map((b) => `${b.kind}:${b.monthKey}`)).toEqual([
      "spending:2026-11",
      "tips:2026-11",
    ])
    expect(homeBob.currentMonthBadges).toEqual([])

    // Ranks feed for Oct 2026 exposes Oct badges
    const octRanks = await getRanksFeed(db, "monthly", "2026-10")
    const octBob = octRanks.players.find((p) => p.id === bob.id)!
    expect(octBob.currentMonthBadges?.map((b) => `${b.kind}:${b.monthKey}`)).toEqual([
      "tips:2026-10",
    ])

    // Player detail returns full history across Oct + Nov
    const aliceDetail = await getPlayerDetail(db, alice.id)
    expect(
      aliceDetail.monthlyBadges.map((b) => `${b.kind}:${b.monthKey}`)
    ).toEqual(["spending:2026-11", "tips:2026-11", "spending:2026-10"])
    expect(
      aliceDetail.player.currentMonthBadges?.map((b) => `${b.kind}:${b.monthKey}`)
    ).toEqual(["spending:2026-11", "tips:2026-11"])
  })

  it("computes latest standing change for crown takeover, close chase, and overtake deterministically", () => {
    const players = [
      { id: "p-alice", name: "Alice" },
      { id: "p-bob", name: "Bob" },
      { id: "p-cara", name: "Cara" },
    ]

    // Single bill has no prior baseline -> returns null
    const singleBillChange = computeLatestStandingChange({
      players,
      bills: [
        {
          id: "b1",
          merchant: "Bakmi GM",
          orderDate: "2026-11-01",
          publishedAt: "2026-11-01T12:00:00.000Z",
        },
      ],
      splits: [
        {
          billPlayerId: "bp1",
          billId: "b1",
          playerId: "p-alice",
          shareAmount: 50000,
          paymentStatus: "unpaid",
          paidAmount: null,
          paidAt: null,
        },
      ],
      targetMonth: "2026-11",
    })
    expect(singleBillChange).toBeNull()

    // Crown takeover: Bob passes Alice for #1 on second bill
    const crownChange = computeLatestStandingChange({
      players,
      bills: [
        {
          id: "b1",
          merchant: "Bakmi GM",
          orderDate: "2026-11-01",
          publishedAt: "2026-11-01T12:00:00.000Z",
        },
        {
          id: "b2",
          merchant: "Sate Khas",
          orderDate: "2026-11-05",
          publishedAt: "2026-11-05T12:00:00.000Z",
        },
      ],
      splits: [
        {
          billPlayerId: "bp1",
          billId: "b1",
          playerId: "p-alice",
          shareAmount: 50000,
          paymentStatus: "unpaid",
          paidAmount: null,
          paidAt: null,
        },
        {
          billPlayerId: "bp2",
          billId: "b1",
          playerId: "p-bob",
          shareAmount: 20000,
          paymentStatus: "unpaid",
          paidAmount: null,
          paidAt: null,
        },
        {
          billPlayerId: "bp3",
          billId: "b2",
          playerId: "p-bob",
          shareAmount: 45000,
          paymentStatus: "unpaid",
          paidAmount: null,
          paidAt: null,
        },
      ],
      targetMonth: "2026-11",
    })
    expect(crownChange).not.toBeNull()
    expect(crownChange?.board).toBe("spending")
    expect(crownChange?.kind).toBe("crown")
    expect(crownChange?.actorId).toBe("p-bob")
    expect(crownChange?.targetId).toBe("p-alice")
    expect(crownChange?.gapAmount).toBe(15000)
    expect(crownChange?.triggerLabel).toBe("Sate Khas")

    // Close chase: Alice closes within Rp5,000 of Bob on third bill
    const chaseChange = computeLatestStandingChange({
      players,
      bills: [
        {
          id: "b1",
          merchant: "Bakmi GM",
          orderDate: "2026-11-01",
          publishedAt: "2026-11-01T12:00:00.000Z",
        },
        {
          id: "b2",
          merchant: "Sate Khas",
          orderDate: "2026-11-05",
          publishedAt: "2026-11-05T12:00:00.000Z",
        },
        {
          id: "b3",
          merchant: "Kopi Kenangan",
          orderDate: "2026-11-07",
          publishedAt: "2026-11-07T12:00:00.000Z",
        },
      ],
      splits: [
        {
          billPlayerId: "bp1",
          billId: "b1",
          playerId: "p-alice",
          shareAmount: 50000,
          paymentStatus: "unpaid",
          paidAmount: null,
          paidAt: null,
        },
        {
          billPlayerId: "bp2",
          billId: "b1",
          playerId: "p-bob",
          shareAmount: 20000,
          paymentStatus: "unpaid",
          paidAmount: null,
          paidAt: null,
        },
        {
          billPlayerId: "bp3",
          billId: "b2",
          playerId: "p-bob",
          shareAmount: 45000,
          paymentStatus: "unpaid",
          paidAmount: null,
          paidAt: null,
        },
        {
          billPlayerId: "bp4",
          billId: "b3",
          playerId: "p-alice",
          shareAmount: 11000,
          paymentStatus: "unpaid",
          paidAmount: null,
          paidAt: null,
        },
      ],
      targetMonth: "2026-11",
    })
    expect(chaseChange).not.toBeNull()
    expect(chaseChange?.kind).toBe("close-chase")
    expect(chaseChange?.actorId).toBe("p-alice")
    expect(chaseChange?.targetId).toBe("p-bob")
    expect(chaseChange?.gapAmount).toBe(4000)

    // Newer tip crown takeover overrides earlier spending shift
    const tipCrown = computeLatestStandingChange({
      players,
      bills: [
        {
          id: "b1",
          merchant: "Bakmi GM",
          orderDate: "2026-11-01",
          publishedAt: "2026-11-01T12:00:00.000Z",
        },
        {
          id: "b2",
          merchant: "Sate Khas",
          orderDate: "2026-11-05",
          publishedAt: "2026-11-05T12:00:00.000Z",
        },
      ],
      splits: [
        {
          billPlayerId: "bp1",
          billId: "b1",
          playerId: "p-alice",
          shareAmount: 50000,
          paymentStatus: "paid",
          paidAmount: 53000,
          paidAt: "2026-11-02T10:00:00.000Z",
        },
        {
          billPlayerId: "bp2",
          billId: "b2",
          playerId: "p-cara",
          shareAmount: 20000,
          paymentStatus: "paid",
          paidAmount: 27000,
          paidAt: "2026-11-06T10:00:00.000Z",
        },
      ],
      targetMonth: "2026-11",
    })
    expect(tipCrown).not.toBeNull()
    expect(tipCrown?.board).toBe("tips")
    expect(tipCrown?.kind).toBe("crown")
    expect(tipCrown?.actorId).toBe("p-cara")
    expect(tipCrown?.targetId).toBe("p-alice")
  })
})
