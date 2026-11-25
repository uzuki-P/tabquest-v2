import { and, asc, eq, isNull } from "drizzle-orm"
import { uuidv7 } from "uuidv7"
import { z } from "zod"

import type { Database } from "@/db"
import {
  billPlayers,
  bills,
  paymentEvents,
  paymentStatuses,
  players,
  transferClaims,
} from "@/db/schema"
import { nowUtcIso } from "@/lib/time"

import { ServiceError } from "./errors"

const safePositiveInt = z
  .number()
  .int()
  .refine(
    (n) => Number.isSafeInteger(n) && n > 0,
    "Amount must be a positive integer rupiah value."
  )

const safeNonNegativeInt = z
  .number()
  .int()
  .refine(
    (n) => Number.isSafeInteger(n) && n >= 0,
    "Amount must be a non-negative integer rupiah value."
  )

export const togglePaymentSchema = z.object({
  billPlayerId: z.string().trim().min(1),
  status: z.enum(["paid", "unpaid"]).optional(),
  paidAmount: safeNonNegativeInt.nullable().optional(),
})

export const collectAllSchema = z.object({
  playerId: z.string().trim().min(1),
  receivedAmount: safePositiveInt,
})

export const createTransferClaimSchema = z.object({
  claimedAmount: safePositiveInt,
})

export const dismissTransferClaimSchema = z.object({
  playerId: z.string().trim().min(1),
  claimId: z.string().trim().min(1).optional(),
})

/**
 * Toggles a single bill-player's payment status and/or records an explicit
 * `paidAmount`. Uses an atomic `db.batch([...])` to update `payment_statuses`
 * and append a `payment_events` audit record.
 */
export async function toggleBillPlayerPayment(
  db: Database,
  rawInput: z.infer<typeof togglePaymentSchema>,
  actor: string
) {
  const input = togglePaymentSchema.parse(rawInput)

  const [current] = await db
    .select({
      billPlayerId: paymentStatuses.billPlayerId,
      status: paymentStatuses.status,
      paidAmount: paymentStatuses.paidAmount,
      paidAt: paymentStatuses.paidAt,
      shareAmount: billPlayers.shareAmount,
    })
    .from(paymentStatuses)
    .innerJoin(billPlayers, eq(billPlayers.id, paymentStatuses.billPlayerId))
    .where(eq(paymentStatuses.billPlayerId, input.billPlayerId))
    .limit(1)

  if (!current) {
    throw new ServiceError(
      404,
      "BILL_PLAYER_NOT_FOUND",
      "Bill player payment record not found."
    )
  }

  const now = nowUtcIso()
  const nextStatus: "paid" | "unpaid" =
    input.status ??
    (input.paidAmount !== undefined && input.paidAmount !== null
      ? "paid"
      : current.status === "paid"
        ? "unpaid"
        : "paid")

  const nextPaidAmount =
    input.paidAmount !== undefined
      ? input.paidAmount
      : nextStatus === "paid"
        ? (current.paidAmount ?? current.shareAmount)
        : current.paidAmount

  const nextPaidAt =
    nextStatus === "paid" ? (current.paidAt ?? now) : null

  const statusChanged = current.status !== nextStatus

  if (statusChanged) {
    await db.batch([
      db
        .update(paymentStatuses)
        .set({
          status: nextStatus,
          paidAmount: nextPaidAmount,
          paidAt: nextPaidAt,
          lastChangedBy: actor,
          updatedAt: now,
        })
        .where(eq(paymentStatuses.billPlayerId, input.billPlayerId)),
      db.insert(paymentEvents).values({
        id: uuidv7(),
        billPlayerId: input.billPlayerId,
        previousState: current.status,
        newState: nextStatus,
        actorIdentity: actor,
        eventTime: now,
      }),
    ])
  } else {
    await db
      .update(paymentStatuses)
      .set({
        paidAmount: nextPaidAmount,
        lastChangedBy: actor,
        updatedAt: now,
      })
      .where(eq(paymentStatuses.billPlayerId, input.billPlayerId))
  }

  return {
    billPlayerId: input.billPlayerId,
    status: nextStatus,
    paidAmount: nextPaidAmount,
    paidAt: nextPaidAt,
    updatedAt: now,
  }
}

export interface CollectAllResult {
  playerId: string
  settledCount: number
  totalOwed: number
  receivedAmount: number
  tipAmount: number
  confirmedClaimIds: string[]
  settledBillPlayerIds: string[]
}

/**
 * Admin Collect All: settles all currently unpaid published bills for a player
 * in one atomic `db.batch([...])`.
 *
 * Rules:
 * - Reads ONLY `payment_statuses` (`status = 'unpaid'` hitting `payment_statuses_unpaid_idx`)
 *   + `bill_players` (split snapshot `shareAmount`) + `bills` + pending `transfer_claims`
 *   (`status = 'pending'` hitting `transfer_claims_pending_idx`).
 * - Excess above `totalOwed` is logged as tip on the most recent unpaid bill
 *   (ordered by `order_date ASC, bills.id ASC`). Shortfalls also land on the
 *   most recent bill (clamped at >= 0).
 * - Uses optimistic `WHERE bill_player_id = ? AND status = 'unpaid'` guards on
 *   every update and verifies the affected row count so double-clicks cannot
 *   double-credit tips.
 */
export async function collectAllForPlayer(
  db: Database,
  rawInput: z.infer<typeof collectAllSchema>,
  actor: string
): Promise<CollectAllResult> {
  const input = collectAllSchema.parse(rawInput)

  // Batch independent reads in 1 D1 round-trip using partial indexes
  const [unpaidRows, pendingClaimRows] = await db.batch([
    db
      .select({
        billPlayerId: billPlayers.id,
        orderDate: bills.orderDate,
        shareAmount: billPlayers.shareAmount,
      })
      .from(paymentStatuses)
      .innerJoin(billPlayers, eq(billPlayers.id, paymentStatuses.billPlayerId))
      .innerJoin(bills, eq(bills.id, billPlayers.billId))
      .where(
        and(
          eq(paymentStatuses.status, "unpaid"),
          eq(billPlayers.playerId, input.playerId),
          eq(bills.status, "published"),
          isNull(bills.archivedAt)
        )
      )
      .orderBy(asc(bills.orderDate), asc(bills.id)),
    db
      .select({
        id: transferClaims.id,
      })
      .from(transferClaims)
      .where(
        and(
          eq(transferClaims.status, "pending"),
          eq(transferClaims.playerId, input.playerId)
        )
      ),
  ])

  if (unpaidRows.length === 0) {
    throw new ServiceError(
      409,
      "NOTHING_TO_COLLECT",
      "This player has no unpaid bills to collect."
    )
  }

  const totalOwed = unpaidRows.reduce((sum, row) => sum + row.shareAmount, 0)
  const delta = input.receivedAmount - totalOwed
  const now = nowUtcIso()

  const lastIndex = unpaidRows.length - 1
  const plannedUpdates = unpaidRows.map((row, idx) => ({
    billPlayerId: row.billPlayerId,
    paidAmount:
      idx === lastIndex
        ? Math.max(0, row.shareAmount + delta)
        : row.shareAmount,
  }))

  const statements: Array<
    | ReturnType<ReturnType<Database["update"]>["set"]>
    | ReturnType<
        ReturnType<ReturnType<Database["update"]>["set"]>["where"]
      >
    | ReturnType<ReturnType<Database["insert"]>["values"]>
  > = []

  // Optimistic guard: only flip rows that are STILL 'unpaid'
  for (const item of plannedUpdates) {
    statements.push(
      db
        .update(paymentStatuses)
        .set({
          status: "paid",
          paidAmount: item.paidAmount,
          paidAt: now,
          lastChangedBy: actor,
          updatedAt: now,
        })
        .where(
          and(
            eq(paymentStatuses.billPlayerId, item.billPlayerId),
            eq(paymentStatuses.status, "unpaid")
          )
        )
    )
  }

  // Audit trail events
  for (const item of plannedUpdates) {
    statements.push(
      db.insert(paymentEvents).values({
        id: uuidv7(),
        billPlayerId: item.billPlayerId,
        previousState: "unpaid",
        newState: "paid",
        actorIdentity: actor,
        eventTime: now,
      })
    )
  }

  // Resolve any pending transfer claims for this player
  if (pendingClaimRows.length > 0) {
    statements.push(
      db
        .update(transferClaims)
        .set({
          status: "confirmed",
          resolvedAt: now,
          resolvedBy: actor,
        })
        .where(
          and(
            eq(transferClaims.status, "pending"),
            eq(transferClaims.playerId, input.playerId)
          )
        )
    )
  }

  const [firstStmt, ...restStmts] = statements
  const batchResults = await db.batch([firstStmt, ...restStmts])

  // Verify optimistic guard on D1/SQLite change counts when available
  let updatedCount = 0
  let hasChangeMetadata = false
  for (let i = 0; i < plannedUpdates.length; i++) {
    const res = batchResults[i] as
      | { meta?: { changes?: number }; changes?: number }
      | undefined
    const changes =
      typeof res?.meta?.changes === "number"
        ? res.meta.changes
        : typeof res?.changes === "number"
          ? res.changes
          : null
    if (changes !== null) {
      hasChangeMetadata = true
      updatedCount += changes
    }
  }

  if (hasChangeMetadata && updatedCount === 0) {
    throw new ServiceError(
      409,
      "CONCURRENT_SETTLEMENT",
      "These bills were already settled by another request."
    )
  }

  return {
    playerId: input.playerId,
    settledCount: plannedUpdates.length,
    totalOwed,
    receivedAmount: input.receivedAmount,
    tipAmount: Math.max(0, delta),
    confirmedClaimIds: pendingClaimRows.map((c) => c.id),
    settledBillPlayerIds: plannedUpdates.map((u) => u.billPlayerId),
  }
}

/**
 * Signed-in, linked players report a "Pay All" transfer.
 * Records `claimed_amount`, `expected_owed_at_claim`, `bill_player_ids_json`,
 * and `status = 'pending'`. Any prior pending claim by the same player is
 * superseded in the same atomic `db.batch([...])`.
 */
export async function createTransferClaimForUser(
  db: Database,
  userId: string,
  rawInput: z.infer<typeof createTransferClaimSchema>
) {
  const input = createTransferClaimSchema.parse(rawInput)

  const [linkedPlayer] = await db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(eq(players.userId, userId))
    .limit(1)

  if (!linkedPlayer) {
    throw new ServiceError(
      403,
      "PLAYER_NOT_LINKED",
      "Your account is not linked to a player profile. Ask the admin to link your email."
    )
  }

  const [unpaidRows, existingPending] = await db.batch([
    db
      .select({
        billPlayerId: billPlayers.id,
        shareAmount: billPlayers.shareAmount,
      })
      .from(paymentStatuses)
      .innerJoin(billPlayers, eq(billPlayers.id, paymentStatuses.billPlayerId))
      .innerJoin(bills, eq(bills.id, billPlayers.billId))
      .where(
        and(
          eq(paymentStatuses.status, "unpaid"),
          eq(billPlayers.playerId, linkedPlayer.id),
          eq(bills.status, "published"),
          isNull(bills.archivedAt)
        )
      )
      .orderBy(asc(bills.orderDate), asc(bills.id)),
    db
      .select({ id: transferClaims.id })
      .from(transferClaims)
      .where(
        and(
          eq(transferClaims.status, "pending"),
          eq(transferClaims.playerId, linkedPlayer.id)
        )
      ),
  ])

  if (unpaidRows.length === 0) {
    throw new ServiceError(
      400,
      "NO_UNPAID_BILLS",
      "You have no unpaid bills to claim."
    )
  }

  const expectedOwedAtClaim = unpaidRows.reduce(
    (sum, r) => sum + r.shareAmount,
    0
  )
  const billPlayerIds = unpaidRows.map((r) => r.billPlayerId)
  const now = nowUtcIso()
  const id = uuidv7()

  const insertClaim = db.insert(transferClaims).values({
    id,
    playerId: linkedPlayer.id,
    claimedAmount: input.claimedAmount,
    expectedOwedAtClaim,
    billPlayerIdsJson: JSON.stringify(billPlayerIds),
    status: "pending",
    createdAt: now,
    resolvedAt: null,
    resolvedBy: null,
  })

  if (existingPending.length > 0) {
    await db.batch([
      db
        .update(transferClaims)
        .set({
          status: "dismissed",
          resolvedAt: now,
          resolvedBy: `superseded:${linkedPlayer.id}`,
        })
        .where(
          and(
            eq(transferClaims.status, "pending"),
            eq(transferClaims.playerId, linkedPlayer.id)
          )
        ),
      insertClaim,
    ])
  } else {
    await insertClaim
  }

  return {
    id,
    playerId: linkedPlayer.id,
    claimedAmount: input.claimedAmount,
    expectedOwedAtClaim,
    billPlayerIds,
    status: "pending" as const,
    createdAt: now,
  }
}

/**
 * Admin dismisses a player's pending transfer claim(s), reverting them to unpaid.
 */
export async function dismissTransferClaim(
  db: Database,
  rawInput: z.infer<typeof dismissTransferClaimSchema>,
  actor: string
) {
  const input = dismissTransferClaimSchema.parse(rawInput)
  const now = nowUtcIso()

  const condition = input.claimId
    ? and(
        eq(transferClaims.id, input.claimId),
        eq(transferClaims.playerId, input.playerId),
        eq(transferClaims.status, "pending")
      )
    : and(
        eq(transferClaims.playerId, input.playerId),
        eq(transferClaims.status, "pending")
      )

  await db
    .update(transferClaims)
    .set({
      status: "dismissed",
      resolvedAt: now,
      resolvedBy: actor,
    })
    .where(condition)

  return {
    playerId: input.playerId,
    dismissedAt: now,
  }
}
