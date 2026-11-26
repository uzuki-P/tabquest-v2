import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"
import { uuidv7 } from "uuidv7"
import { z } from "zod"

import type { Database } from "@/db"
import { chunkForD1 } from "@/db/limits"
import {
  adjustmentAllocations,
  adjustments,
  billPlayers,
  bills,
  itemAllocations,
  items,
  paymentStatuses,
  players,
  transferClaims,
} from "@/db/schema"
import {
  computeSplit,
  roundingBillPlayerId as findRoundingBillPlayerId,
} from "@/domain/split"
import type { SplitResult, SplitVersion } from "@/domain/split"
import type { BillSplitSummary, BillSummary } from "@/domain/types"
import { isValidDateString, nowUtcIso } from "@/lib/time"

import { ServiceError } from "./errors"

const safeInt = z
  .number()
  .int()
  .refine((n) => Number.isSafeInteger(n), "Must be a safe integer rupiah value.")

const billItemInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(160),
  variantNotes: z.string().trim().max(240).nullable().optional(),
  quantity: safeInt.min(1),
  bundleSize: safeInt.min(1).default(1),
  unitPrice: safeInt.min(0),
})

const billAdjustmentInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  type: z.enum(["discount", "delivery", "service", "tax", "other"]),
  label: z.string().trim().min(1).max(160),
  signedAmount: safeInt,
  originalAmount: safeInt.nullable().optional(),
})

const billPlayerInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  playerId: z.string().trim().min(1).nullable().optional(),
  alias: z.string().trim().min(1).max(80),
})

const billAllocationInputSchema = z.object({
  /** Matches the input item's `id` or 0-based index string. */
  itemKey: z.string().trim().min(1),
  /** Matches the input billPlayer's `id` or `playerId`. */
  billPlayerKey: z.string().trim().min(1),
  quantity: safeInt.min(1),
})

export const upsertBillSchema = z.object({
  merchant: z.string().trim().min(1, "Merchant is required.").max(160),
  title: z.string().trim().max(160).nullable().optional(),
  orderDate: z
    .string()
    .trim()
    .refine(isValidDateString, "Order date must be YYYY-MM-DD."),
  imageObjectKey: z.string().trim().max(200).nullable().optional(),
  imageMediaType: z.string().trim().max(80).nullable().optional(),
  imageByteSize: safeInt.min(0).nullable().optional(),
  publish: z.boolean().default(false),
  items: z.array(billItemInputSchema).min(1, "At least one item is required."),
  adjustments: z.array(billAdjustmentInputSchema).default([]),
  billPlayers: z
    .array(billPlayerInputSchema)
    .min(1, "At least one player is required."),
  allocations: z.array(billAllocationInputSchema).default([]),
})

export type UpsertBillInput = z.infer<typeof upsertBillSchema>

function generatePublicId(merchant: string): string {
  const slug = merchant
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24)
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${slug || "bill"}-${hex}`
}

function buildPublicReceiptUrl(
  publicId: string,
  imageObjectKey: string | null
): string | null {
  if (!imageObjectKey) return null
  return `/api/public/bills/${encodeURIComponent(publicId)}/image?v=${encodeURIComponent(imageObjectKey)}`
}

interface ResolvedBillGraph {
  items: Array<{
    id: string
    name: string
    variantNotes: string | null
    quantity: number
    unitPrice: number
    lineTotal: number
    bundleSize: number
    sortOrder: number
  }>
  adjustments: Array<{
    id: string
    type: string
    label: string
    signedAmount: number
    originalAmount: number | null
    sortOrder: number
  }>
  billPlayers: Array<{
    id: string
    alias: string
    playerId: string | null
    sortOrder: number
  }>
  allocations: Array<{
    id: string
    itemId: string
    billPlayerId: string
    quantity: number
  }>
  sourceSubtotal: number
  finalTotal: number
}

function resolveBillGraph(input: UpsertBillInput): ResolvedBillGraph {
  const itemKeyToId = new Map<string, string>()
  const resolvedItems = input.items.map((item, idx) => {
    const id = uuidv7()
    if (item.id) itemKeyToId.set(item.id, id)
    itemKeyToId.set(String(idx), id)
    return {
      id,
      name: item.name,
      variantNotes: item.variantNotes?.trim() || null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.quantity * item.unitPrice,
      bundleSize: item.bundleSize,
      sortOrder: idx,
    }
  })

  const resolvedAdjustments = input.adjustments.map((adj, idx) => ({
    id: uuidv7(),
    type: adj.type,
    label: adj.label,
    signedAmount: adj.signedAmount,
    originalAmount: adj.originalAmount ?? null,
    sortOrder: idx,
  }))

  const bpKeyToId = new Map<string, string>()
  const resolvedBillPlayers = input.billPlayers.map((bp, idx) => {
    const id = uuidv7()
    if (bp.id) bpKeyToId.set(bp.id, id)
    if (bp.playerId) bpKeyToId.set(bp.playerId, id)
    bpKeyToId.set(String(idx), id)
    return {
      id,
      alias: bp.alias,
      playerId: bp.playerId ?? null,
      sortOrder: idx,
    }
  })

  const resolvedAllocations: ResolvedBillGraph["allocations"] = []
  for (const alloc of input.allocations) {
    const itemId = itemKeyToId.get(alloc.itemKey)
    const billPlayerId = bpKeyToId.get(alloc.billPlayerKey)
    if (!itemId || !billPlayerId) continue
    resolvedAllocations.push({
      id: uuidv7(),
      itemId,
      billPlayerId,
      quantity: alloc.quantity,
    })
  }

  const sourceSubtotal = resolvedItems.reduce((s, i) => s + i.lineTotal, 0)
  const adjustmentsTotal = resolvedAdjustments.reduce(
    (s, a) => s + a.signedAmount,
    0
  )
  const finalTotal = sourceSubtotal + adjustmentsTotal

  return {
    items: resolvedItems,
    adjustments: resolvedAdjustments,
    billPlayers: resolvedBillPlayers,
    allocations: resolvedAllocations,
    sourceSubtotal,
    finalTotal,
  }
}

function tryComputeSplitSnapshot(
  graph: ResolvedBillGraph,
  roundingBpId: string | undefined,
  strict: boolean
): SplitResult | null {
  try {
    return computeSplit({
      items: graph.items.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        bundleSize: i.bundleSize,
        lineTotal: i.lineTotal,
      })),
      billPlayers: graph.billPlayers.map((p) => ({ id: p.id })),
      allocations: graph.allocations.map((a) => ({
        itemId: a.itemId,
        billPlayerId: a.billPlayerId,
        quantity: a.quantity,
      })),
      adjustments: graph.adjustments.map((a) => ({
        id: a.id,
        type: a.type,
        amount: a.signedAmount,
      })),
      sourceSubtotal: graph.sourceSubtotal,
      finalTotal: graph.finalTotal,
      splitVersion: 2,
      roundingBillPlayerId: roundingBpId,
    })
  } catch (err) {
    if (strict) throw err
    return null
  }
}

/**
 * Creates a bill (draft or immediately published) atomically via `db.batch([...])`,
 * persisting `bill_players` split snapshots (`item_subtotal`, `adjustment_total`,
 * `share_amount`) and `adjustment_allocations` so summary queries never need to
 * scan itemized allocation tables.
 */
export async function createBill(
  db: Database,
  rawInput: UpsertBillInput
): Promise<{
  id: string
  publicId: string
  status: "draft" | "published"
  finalTotal: number
}> {
  const input = upsertBillSchema.parse(rawInput)
  const graph = resolveBillGraph(input)

  const [roundingPlayer] = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.takesRounding, true))
    .limit(1)

  const roundingBpId = findRoundingBillPlayerId(
    graph.billPlayers,
    roundingPlayer?.id
  )

  const split = tryComputeSplitSnapshot(graph, roundingBpId, input.publish)
  const shareByBpId = new Map(
    (split?.shares ?? []).map((s) => [s.billPlayerId, s])
  )

  const now = nowUtcIso()
  const billId = uuidv7()
  const publicId = generatePublicId(input.merchant)
  const status: "draft" | "published" = input.publish ? "published" : "draft"

  const billPlayerRows = graph.billPlayers.map((bp) => {
    const share = shareByBpId.get(bp.id)
    const itemSub = share?.itemSubtotal ?? 0
    const adjTotal = share
      ? share.adjustmentShares.reduce((s, a) => s + a.amount, 0)
      : 0
    const total = share?.total ?? 0
    return {
      id: bp.id,
      billId,
      alias: bp.alias,
      sortOrder: bp.sortOrder,
      playerId: bp.playerId,
      itemSubtotal: itemSub,
      adjustmentTotal: adjTotal,
      shareAmount: total,
    }
  })

  const adjAllocRows: Array<{
    id: string
    adjustmentId: string
    billPlayerId: string
    signedAmount: number
  }> = []
  if (split) {
    for (const share of split.shares) {
      for (const adjShare of share.adjustmentShares) {
        adjAllocRows.push({
          id: uuidv7(),
          adjustmentId: adjShare.adjustmentId,
          billPlayerId: share.billPlayerId,
          signedAmount: adjShare.amount,
        })
      }
    }
  }

  const paymentStatusRows = billPlayerRows.map((bp) => ({
    billPlayerId: bp.id,
    status: "unpaid" as const,
    paidAmount: null,
    paidAt: null,
    lastChangedBy: null,
    updatedAt: now,
  }))

  const statements: Array<ReturnType<ReturnType<Database["insert"]>["values"]>> =
    [
      db.insert(bills).values({
        id: billId,
        publicId,
        merchant: input.merchant,
        title: input.title?.trim() || null,
        orderDate: input.orderDate,
        timezone: "Asia/Jakarta",
        currency: "IDR",
        sourceSubtotal: graph.sourceSubtotal,
        finalTotal: graph.finalTotal,
        status,
        imageObjectKey: input.imageObjectKey?.trim() || null,
        imageMediaType: input.imageMediaType?.trim() || null,
        imageByteSize: input.imageByteSize ?? null,
        createdAt: now,
        updatedAt: now,
        publishedAt: input.publish ? now : null,
        archivedAt: null,
        splitVersion: 2,
        roundingBillPlayerId: input.publish ? (roundingBpId ?? null) : null,
      }),
    ]

  // Chunk every multi-row insert with chunkForD1 to stay well under D1's 100-param limit
  for (const chunk of chunkForD1(billPlayerRows, 8)) {
    statements.push(db.insert(billPlayers).values(chunk))
  }
  for (const chunk of chunkForD1(graph.items, 9)) {
    statements.push(
      db.insert(items).values(chunk.map((i) => ({ ...i, billId })))
    )
  }
  for (const chunk of chunkForD1(graph.allocations, 4)) {
    statements.push(db.insert(itemAllocations).values(chunk))
  }
  for (const chunk of chunkForD1(graph.adjustments, 7)) {
    statements.push(
      db.insert(adjustments).values(chunk.map((a) => ({ ...a, billId })))
    )
  }
  for (const chunk of chunkForD1(adjAllocRows, 4)) {
    statements.push(db.insert(adjustmentAllocations).values(chunk))
  }
  for (const chunk of chunkForD1(paymentStatusRows, 6)) {
    statements.push(db.insert(paymentStatuses).values(chunk))
  }

  const [first, ...rest] = statements
  await db.batch([first, ...rest])

  return {
    id: billId,
    publicId,
    status,
    finalTotal: graph.finalTotal,
  }
}

/**
 * Publishes an existing draft bill: validates split with `computeSplit()`,
 * fixes `rounding_bill_player_id` and `split_version = 2`, persists exact
 * `bill_players` split snapshots and `adjustment_allocations` atomically.
 */
export async function publishBill(db: Database, billId: string) {
  const [billRows, bpRows, itemRows, adjRows, roundingPlayers] = await db.batch([
    db.select().from(bills).where(eq(bills.id, billId)).limit(1),
    db
      .select()
      .from(billPlayers)
      .where(eq(billPlayers.billId, billId))
      .orderBy(asc(billPlayers.sortOrder)),
    db
      .select()
      .from(items)
      .where(eq(items.billId, billId))
      .orderBy(asc(items.sortOrder)),
    db
      .select()
      .from(adjustments)
      .where(eq(adjustments.billId, billId))
      .orderBy(asc(adjustments.sortOrder)),
    db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.takesRounding, true))
      .limit(1),
  ])

  const bill = billRows[0]
  if (!bill) {
    throw new ServiceError(404, "BILL_NOT_FOUND", "Bill not found.")
  }

  const itemIds = itemRows.map((i) => i.id)
  const allocRows =
    itemIds.length > 0
      ? (
          await Promise.all(
            chunkForD1(itemIds).map((chunk) =>
              db
                .select()
                .from(itemAllocations)
                .where(inArray(itemAllocations.itemId, chunk))
            )
          )
        ).flat()
      : []

  const roundingBpId = findRoundingBillPlayerId(
    bpRows.map((bp) => ({ id: bp.id, playerId: bp.playerId })),
    roundingPlayers[0]?.id
  )

  const split = computeSplit({
    items: itemRows.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      bundleSize: i.bundleSize,
      lineTotal: i.lineTotal,
    })),
    billPlayers: bpRows.map((bp) => ({ id: bp.id })),
    allocations: allocRows.map((a) => ({
      itemId: a.itemId,
      billPlayerId: a.billPlayerId,
      quantity: a.quantity,
    })),
    adjustments: adjRows.map((a) => ({
      id: a.id,
      type: a.type,
      amount: a.signedAmount,
    })),
    sourceSubtotal: bill.sourceSubtotal,
    finalTotal: bill.finalTotal,
    splitVersion: 2,
    roundingBillPlayerId: roundingBpId,
  })

  const now = nowUtcIso()
  const adjIds = adjRows.map((a) => a.id)
  const newAdjAllocs = split.shares.flatMap((share) =>
    share.adjustmentShares.map((adjShare) => ({
      id: uuidv7(),
      adjustmentId: adjShare.adjustmentId,
      billPlayerId: share.billPlayerId,
      signedAmount: adjShare.amount,
    }))
  )

  // Atomic batch: update bill, update each billPlayer snapshot, replace adjustmentAllocations
  const statements: Array<
    | ReturnType<ReturnType<Database["update"]>["set"]>
    | ReturnType<ReturnType<ReturnType<Database["update"]>["set"]>["where"]>
    | ReturnType<ReturnType<Database["delete"]>["where"]>
    | ReturnType<ReturnType<Database["insert"]>["values"]>
  > = [
    db
      .update(bills)
      .set({
        status: "published",
        publishedAt: bill.publishedAt ?? now,
        updatedAt: now,
        splitVersion: 2,
        roundingBillPlayerId: roundingBpId ?? null,
      })
      .where(eq(bills.id, billId)),
  ]

  for (const share of split.shares) {
    const adjTotal = share.adjustmentShares.reduce((s, a) => s + a.amount, 0)
    statements.push(
      db
        .update(billPlayers)
        .set({
          itemSubtotal: share.itemSubtotal,
          adjustmentTotal: adjTotal,
          shareAmount: share.total,
        })
        .where(eq(billPlayers.id, share.billPlayerId))
    )
  }

  for (const chunk of chunkForD1(adjIds)) {
    statements.push(
      db
        .delete(adjustmentAllocations)
        .where(inArray(adjustmentAllocations.adjustmentId, chunk))
    )
  }
  for (const chunk of chunkForD1(newAdjAllocs, 4)) {
    statements.push(db.insert(adjustmentAllocations).values(chunk))
  }

  const [first, ...rest] = statements
  await db.batch([first, ...rest])

  return {
    id: bill.id,
    publicId: bill.publicId,
    status: "published" as const,
    roundingBillPlayerId: roundingBpId ?? null,
  }
}

export async function unpublishBill(db: Database, billId: string) {
  const [bill] = await db
    .select({ id: bills.id, publicId: bills.publicId })
    .from(bills)
    .where(eq(bills.id, billId))
    .limit(1)

  if (!bill) {
    throw new ServiceError(404, "BILL_NOT_FOUND", "Bill not found.")
  }

  const now = nowUtcIso()
  await db
    .update(bills)
    .set({
      status: "draft",
      publishedAt: null,
      roundingBillPlayerId: null,
      updatedAt: now,
    })
    .where(eq(bills.id, billId))

  return { id: bill.id, publicId: bill.publicId, status: "draft" as const }
}

export async function setBillArchived(
  db: Database,
  billId: string,
  archived: boolean
) {
  const [bill] = await db
    .select({ id: bills.id, publicId: bills.publicId })
    .from(bills)
    .where(eq(bills.id, billId))
    .limit(1)

  if (!bill) {
    throw new ServiceError(404, "BILL_NOT_FOUND", "Bill not found.")
  }

  const now = nowUtcIso()
  const archivedAt = archived ? now : null
  await db
    .update(bills)
    .set({
      archivedAt,
      updatedAt: now,
    })
    .where(eq(bills.id, billId))

  return { id: bill.id, publicId: bill.publicId, archivedAt }
}

export async function deleteDraftBill(
  db: Database,
  r2: R2Bucket | null,
  billId: string
) {
  const [bill] = await db
    .select({
      id: bills.id,
      status: bills.status,
      imageObjectKey: bills.imageObjectKey,
    })
    .from(bills)
    .where(eq(bills.id, billId))
    .limit(1)

  if (!bill) {
    throw new ServiceError(404, "BILL_NOT_FOUND", "Bill not found.")
  }
  if (bill.status !== "draft") {
    throw new ServiceError(
      400,
      "CANNOT_DELETE_PUBLISHED",
      "Only draft bills can be deleted. Archive published bills instead."
    )
  }

  await db.delete(bills).where(eq(bills.id, billId))

  if (bill.imageObjectKey && r2) {
    await r2.delete(bill.imageObjectKey).catch(() => {})
  }

  return { deletedId: billId }
}

/**
 * Lists all bills for Admin Bills (active published, drafts, archived) using
 * ONLY `bills + bill_players + payment_statuses` in a single `db.batch([...])`.
 */
export async function listAdminBills(db: Database): Promise<{
  active: BillSummary[]
  drafts: BillSummary[]
  archived: BillSummary[]
}> {
  const [billRows, bpRows] = await db.batch([
    db
      .select()
      .from(bills)
      .orderBy(desc(bills.orderDate), desc(bills.createdAt)),
    db
      .select({
        billPlayerId: billPlayers.id,
        billId: billPlayers.billId,
        playerId: billPlayers.playerId,
        alias: billPlayers.alias,
        sortOrder: billPlayers.sortOrder,
        itemSubtotal: billPlayers.itemSubtotal,
        adjustmentTotal: billPlayers.adjustmentTotal,
        shareAmount: billPlayers.shareAmount,
        paymentStatus: paymentStatuses.status,
        paidAmount: paymentStatuses.paidAmount,
        paidAt: paymentStatuses.paidAt,
      })
      .from(billPlayers)
      .leftJoin(
        paymentStatuses,
        eq(paymentStatuses.billPlayerId, billPlayers.id)
      )
      .orderBy(asc(billPlayers.sortOrder)),
  ])

  const splitsByBillId = new Map<string, BillSplitSummary[]>()
  for (const row of bpRows) {
    const list = splitsByBillId.get(row.billId) ?? []
    list.push({
      billPlayerId: row.billPlayerId,
      playerId: row.playerId ?? row.billPlayerId,
      name: row.alias,
      items: [],
      itemSubtotal: row.itemSubtotal,
      discountShare: row.adjustmentTotal < 0 ? row.adjustmentTotal : 0,
      feeShare: row.adjustmentTotal > 0 ? row.adjustmentTotal : 0,
      totalOwed: row.shareAmount,
      status: row.paymentStatus === "paid" ? "paid" : "unpaid",
      paidAmount: row.paidAmount,
      paidAt: row.paidAt,
    })
    splitsByBillId.set(row.billId, list)
  }

  const active: BillSummary[] = []
  const drafts: BillSummary[] = []
  const archived: BillSummary[] = []

  for (const b of billRows) {
    const splits = splitsByBillId.get(b.id) ?? []
    const paidCount = splits.filter((s) => s.status === "paid").length
    const netAdj = b.finalTotal - b.sourceSubtotal
    const summary: BillSummary = {
      id: b.id,
      publicId: b.publicId,
      merchant: b.merchant,
      title: b.title,
      orderDate: b.orderDate,
      status: b.status === "published" ? "published" : "draft",
      archivedAt: b.archivedAt,
      sourceSubtotal: b.sourceSubtotal,
      voucherDiscount: netAdj < 0 ? netAdj : 0,
      flatFees: netAdj > 0 ? netAdj : 0,
      finalTotal: b.finalTotal,
      paidCount,
      totalPlayers: splits.length,
      hasReceiptImage: Boolean(b.imageObjectKey),
      receiptUrl: buildPublicReceiptUrl(b.publicId, b.imageObjectKey),
      splits,
    }

    if (b.status === "draft") {
      drafts.push(summary)
    } else if (b.archivedAt !== null) {
      archived.push(summary)
    } else {
      active.push(summary)
    }
  }

  return { active, drafts, archived }
}

/**
 * Single public bill detail (`/b/$publicId`) with full itemized breakdown,
 * adjustment shares, payment statuses, and R2 receipt image URL.
 * Only published bills are returned; drafts return 404.
 */
export async function getPublicBillDetail(
  db: Database,
  publicId: string
): Promise<{
  bill: BillSummary
  adjustments: Array<{
    id: string
    type: string
    label: string
    signedAmount: number
    originalAmount: number | null
  }>
  receiptItems: Array<{
    id: string
    name: string
    variantNotes: string | null
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
  splitVersion: SplitVersion
}> {
  const [bill] = await db
    .select()
    .from(bills)
    .where(and(eq(bills.publicId, publicId), eq(bills.status, "published")))
    .limit(1)

  if (!bill) {
    throw new ServiceError(404, "BILL_NOT_FOUND", "Bill not found.")
  }

  const [bpRows, itemRows, adjRows, pendingClaims] = await db.batch([
    db
      .select({
        billPlayerId: billPlayers.id,
        playerId: billPlayers.playerId,
        alias: billPlayers.alias,
        sortOrder: billPlayers.sortOrder,
        itemSubtotal: billPlayers.itemSubtotal,
        adjustmentTotal: billPlayers.adjustmentTotal,
        shareAmount: billPlayers.shareAmount,
        paymentStatus: paymentStatuses.status,
        paidAmount: paymentStatuses.paidAmount,
        paidAt: paymentStatuses.paidAt,
      })
      .from(billPlayers)
      .leftJoin(
        paymentStatuses,
        eq(paymentStatuses.billPlayerId, billPlayers.id)
      )
      .where(eq(billPlayers.billId, bill.id))
      .orderBy(asc(billPlayers.sortOrder)),
    db
      .select()
      .from(items)
      .where(eq(items.billId, bill.id))
      .orderBy(asc(items.sortOrder)),
    db
      .select()
      .from(adjustments)
      .where(eq(adjustments.billId, bill.id))
      .orderBy(asc(adjustments.sortOrder)),
    db
      .select({
        playerId: transferClaims.playerId,
      })
      .from(transferClaims)
      .where(eq(transferClaims.status, "pending")),
  ])

  const bpIds = bpRows.map((bp) => bp.billPlayerId)
  const [itemAllocRows, adjAllocRows] =
    bpIds.length > 0
      ? await db.batch([
          db
            .select()
            .from(itemAllocations)
            .where(inArray(itemAllocations.billPlayerId, bpIds)),
          db
            .select()
            .from(adjustmentAllocations)
            .where(inArray(adjustmentAllocations.billPlayerId, bpIds)),
        ])
      : [[], []]

  const itemById = new Map(itemRows.map((i) => [i.id, i]))
  const adjById = new Map(adjRows.map((a) => [a.id, a]))

  const itemsByBpId = new Map<
    string,
    Array<{ name: string; variantNotes: string | null; qty: number; price: number }>
  >()
  for (const alloc of itemAllocRows) {
    const item = itemById.get(alloc.itemId)
    if (!item) continue
    const list = itemsByBpId.get(alloc.billPlayerId) ?? []
    const perUnitCost =
      item.bundleSize > 1
        ? Math.round(item.lineTotal / (item.quantity * item.bundleSize))
        : item.unitPrice
    list.push({
      name: item.name,
      variantNotes: item.variantNotes,
      qty: alloc.quantity,
      price: perUnitCost,
    })
    itemsByBpId.set(alloc.billPlayerId, list)
  }

  const discountByBpId = new Map<string, number>()
  const feeByBpId = new Map<string, number>()
  for (const alloc of adjAllocRows) {
    const adj = adjById.get(alloc.adjustmentId)
    const isDiscount = adj ? adj.signedAmount < 0 : alloc.signedAmount < 0
    if (isDiscount) {
      discountByBpId.set(
        alloc.billPlayerId,
        (discountByBpId.get(alloc.billPlayerId) ?? 0) + alloc.signedAmount
      )
    } else {
      feeByBpId.set(
        alloc.billPlayerId,
        (feeByBpId.get(alloc.billPlayerId) ?? 0) + alloc.signedAmount
      )
    }
  }

  // Keep pendingClaims referenced to avoid unused warning; UI merges pending claims from players list
  void pendingClaims

  const voucherDiscount = adjRows
    .filter((a) => a.signedAmount < 0)
    .reduce((s, a) => s + a.signedAmount, 0)
  const flatFees = adjRows
    .filter((a) => a.signedAmount > 0)
    .reduce((s, a) => s + a.signedAmount, 0)

  const splits: BillSplitSummary[] = bpRows.map((bp) => ({
    billPlayerId: bp.billPlayerId,
    playerId: bp.playerId ?? bp.billPlayerId,
    name: bp.alias,
    items: itemsByBpId.get(bp.billPlayerId) ?? [],
    itemSubtotal: bp.itemSubtotal,
    discountShare: discountByBpId.get(bp.billPlayerId) ?? 0,
    feeShare: feeByBpId.get(bp.billPlayerId) ?? 0,
    totalOwed: bp.shareAmount,
    status: bp.paymentStatus === "paid" ? "paid" : "unpaid",
    paidAmount: bp.paidAmount,
    paidAt: bp.paidAt,
  }))

  const paidCount = splits.filter((s) => s.status === "paid").length

  return {
    bill: {
      id: bill.id,
      publicId: bill.publicId,
      merchant: bill.merchant,
      title: bill.title,
      orderDate: bill.orderDate,
      status: "published",
      archivedAt: bill.archivedAt,
      sourceSubtotal: bill.sourceSubtotal,
      voucherDiscount,
      flatFees,
      finalTotal: bill.finalTotal,
      paidCount,
      totalPlayers: splits.length,
      hasReceiptImage: Boolean(bill.imageObjectKey),
      receiptUrl: buildPublicReceiptUrl(bill.publicId, bill.imageObjectKey),
      splits,
    },
    adjustments: adjRows.map((a) => ({
      id: a.id,
      type: a.type,
      label: a.label,
      signedAmount: a.signedAmount,
      originalAmount: a.originalAmount,
    })),
    receiptItems: itemRows.map((i) => ({
      id: i.id,
      name: i.name,
      variantNotes: i.variantNotes,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
    splitVersion: bill.splitVersion === 1 ? 1 : 2,
  }
}

/**
 * Admin-only bill detail (works for both drafts and published bills).
 */
export async function getAdminBillDetail(db: Database, billId: string) {
  const [billRows, bpRows, itemRows, adjRows] = await db.batch([
    db.select().from(bills).where(eq(bills.id, billId)).limit(1),
    db
      .select()
      .from(billPlayers)
      .where(eq(billPlayers.billId, billId))
      .orderBy(asc(billPlayers.sortOrder)),
    db
      .select()
      .from(items)
      .where(eq(items.billId, billId))
      .orderBy(asc(items.sortOrder)),
    db
      .select()
      .from(adjustments)
      .where(eq(adjustments.billId, billId))
      .orderBy(asc(adjustments.sortOrder)),
  ])

  const bill = billRows[0]
  if (!bill) {
    throw new ServiceError(404, "BILL_NOT_FOUND", "Bill not found.")
  }

  const bpIds = bpRows.map((bp) => bp.id)
  const [allocRows, statusRows] =
    bpIds.length > 0
      ? await db.batch([
          db
            .select()
            .from(itemAllocations)
            .where(inArray(itemAllocations.billPlayerId, bpIds)),
          db
            .select()
            .from(paymentStatuses)
            .where(inArray(paymentStatuses.billPlayerId, bpIds)),
        ])
      : [[], []]

  return {
    bill,
    billPlayers: bpRows,
    items: itemRows,
    adjustments: adjRows,
    allocations: allocRows,
    paymentStatuses: statusRows,
  }
}

/**
 * Updates an existing bill (draft or published) with new metadata or full
 * itemized graph, recomputing `bill_players` split snapshots atomically.
 */
export async function updateBill(
  db: Database,
  billId: string,
  rawInput: UpsertBillInput
) {
  const input = upsertBillSchema.parse(rawInput)
  const [existingRows, existingBpRows, roundingPlayers] = await db.batch([
    db.select().from(bills).where(eq(bills.id, billId)).limit(1),
    db
      .select({
        id: billPlayers.id,
        playerId: billPlayers.playerId,
        alias: billPlayers.alias,
        status: paymentStatuses.status,
        paidAmount: paymentStatuses.paidAmount,
        paidAt: paymentStatuses.paidAt,
        lastChangedBy: paymentStatuses.lastChangedBy,
        updatedAt: paymentStatuses.updatedAt,
      })
      .from(billPlayers)
      .leftJoin(
        paymentStatuses,
        eq(paymentStatuses.billPlayerId, billPlayers.id)
      )
      .where(eq(billPlayers.billId, billId)),
    db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.takesRounding, true))
      .limit(1),
  ])

  const existing = existingRows[0]
  if (!existing) {
    throw new ServiceError(404, "BILL_NOT_FOUND", "Bill not found.")
  }

  const prevPaymentByPlayerId = new Map<
    string,
    (typeof existingBpRows)[number]
  >()
  const prevPaymentByAlias = new Map<string, (typeof existingBpRows)[number]>()
  for (const row of existingBpRows) {
    if (row.playerId) prevPaymentByPlayerId.set(row.playerId, row)
    prevPaymentByAlias.set(row.alias.toLowerCase(), row)
  }

  const graph = resolveBillGraph(input)
  const willPublish = input.publish || existing.status === "published"
  const roundingBpId = findRoundingBillPlayerId(
    graph.billPlayers,
    roundingPlayers[0]?.id
  )
  const split = tryComputeSplitSnapshot(graph, roundingBpId, willPublish)
  const shareByBpId = new Map(
    (split?.shares ?? []).map((s) => [s.billPlayerId, s])
  )

  const now = nowUtcIso()
  const billPlayerRows = graph.billPlayers.map((bp) => {
    const share = shareByBpId.get(bp.id)
    const itemSub = share?.itemSubtotal ?? 0
    const adjTotal = share
      ? share.adjustmentShares.reduce((s, a) => s + a.amount, 0)
      : 0
    return {
      id: bp.id,
      billId,
      alias: bp.alias,
      sortOrder: bp.sortOrder,
      playerId: bp.playerId,
      itemSubtotal: itemSub,
      adjustmentTotal: adjTotal,
      shareAmount: share?.total ?? 0,
    }
  })

  const adjAllocRows: Array<{
    id: string
    adjustmentId: string
    billPlayerId: string
    signedAmount: number
  }> = []
  if (split) {
    for (const share of split.shares) {
      for (const adjShare of share.adjustmentShares) {
        adjAllocRows.push({
          id: uuidv7(),
          adjustmentId: adjShare.adjustmentId,
          billPlayerId: share.billPlayerId,
          signedAmount: adjShare.amount,
        })
      }
    }
  }

  const paymentStatusRows = billPlayerRows.map((bp) => {
    const prev =
      (bp.playerId ? prevPaymentByPlayerId.get(bp.playerId) : undefined) ??
      prevPaymentByAlias.get(bp.alias.toLowerCase())
    if (prev && prev.status === "paid") {
      return {
        billPlayerId: bp.id,
        status: "paid" as const,
        paidAmount: prev.paidAmount,
        paidAt: prev.paidAt,
        lastChangedBy: prev.lastChangedBy,
        updatedAt: prev.updatedAt ?? now,
      }
    }
    return {
      billPlayerId: bp.id,
      status: "unpaid" as const,
      paidAmount: null,
      paidAt: null,
      lastChangedBy: null,
      updatedAt: now,
    }
  })

  // Delete old child rows (cascades allocations & payment_statuses) and insert new ones atomically
  const statements: Array<
    | ReturnType<ReturnType<Database["update"]>["set"]>
    | ReturnType<ReturnType<ReturnType<Database["update"]>["set"]>["where"]>
    | ReturnType<ReturnType<Database["delete"]>["where"]>
    | ReturnType<ReturnType<Database["insert"]>["values"]>
  > = [
    db
      .update(bills)
      .set({
        merchant: input.merchant,
        title: input.title?.trim() || null,
        orderDate: input.orderDate,
        sourceSubtotal: graph.sourceSubtotal,
        finalTotal: graph.finalTotal,
        status: willPublish ? "published" : "draft",
        publishedAt: willPublish ? (existing.publishedAt ?? now) : null,
        roundingBillPlayerId: willPublish ? (roundingBpId ?? null) : null,
        imageObjectKey:
          input.imageObjectKey !== undefined
            ? input.imageObjectKey?.trim() || null
            : existing.imageObjectKey,
        imageMediaType:
          input.imageMediaType !== undefined
            ? input.imageMediaType?.trim() || null
            : existing.imageMediaType,
        imageByteSize:
          input.imageByteSize !== undefined
            ? input.imageByteSize
            : existing.imageByteSize,
        updatedAt: now,
      })
      .where(eq(bills.id, billId)),
    db.delete(billPlayers).where(eq(billPlayers.billId, billId)),
    db.delete(items).where(eq(items.billId, billId)),
    db.delete(adjustments).where(eq(adjustments.billId, billId)),
  ]

  for (const chunk of chunkForD1(billPlayerRows, 8)) {
    statements.push(db.insert(billPlayers).values(chunk))
  }
  for (const chunk of chunkForD1(graph.items, 9)) {
    statements.push(
      db.insert(items).values(chunk.map((i) => ({ ...i, billId })))
    )
  }
  for (const chunk of chunkForD1(graph.allocations, 4)) {
    statements.push(db.insert(itemAllocations).values(chunk))
  }
  for (const chunk of chunkForD1(graph.adjustments, 7)) {
    statements.push(
      db.insert(adjustments).values(chunk.map((a) => ({ ...a, billId })))
    )
  }
  for (const chunk of chunkForD1(adjAllocRows, 4)) {
    statements.push(db.insert(adjustmentAllocations).values(chunk))
  }
  for (const chunk of chunkForD1(paymentStatusRows, 6)) {
    statements.push(db.insert(paymentStatuses).values(chunk))
  }

  const [first, ...rest] = statements
  await db.batch([first, ...rest])

  return {
    id: billId,
    publicId: existing.publicId,
    status: willPublish ? ("published" as const) : ("draft" as const),
    finalTotal: graph.finalTotal,
  }
}

export { isNull }
