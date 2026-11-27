import { and, asc, desc, eq, isNull } from "drizzle-orm"

import type { Database } from "@/db"
import {
  billPlayers,
  bills,
  paymentStatuses,
  players,
  transferClaims,
} from "@/db/schema"
import type {
  BillSplitSummary,
  BillSummary,
  EarnedBadge,
  HomeFeedResponse,
  PlayerDetailResponse,
  PlayerMonthlyBadge,
  PlayerSummary,
  RanksResponse,
  StandingBoard,
  StandingChangeKind,
  StandingChangeSummary,
  StandingMove,
  UnpaidBillItem,
} from "@/domain/types"
import {
  formatRelativeTime,
  getSpendingLeaderboard,
  getTipLeaderboard,
  makePlayerHandle,
  makePlayerInitials,
} from "@/domain/types"
import { shortMonthLabel, todayJakarta } from "@/lib/time"

import { ServiceError } from "./errors"
import { buildAvatarPublicUrl } from "./players"

const MONTH_KEY_RE = /^\d{4}-\d{2}$/

const WEEKDAYS = [
  { idx: 1, short: "Mon", weekend: false },
  { idx: 2, short: "Tue", weekend: false },
  { idx: 3, short: "Wed", weekend: false },
  { idx: 4, short: "Thu", weekend: false },
  { idx: 5, short: "Fri", weekend: false },
  { idx: 6, short: "Sat", weekend: true },
  { idx: 0, short: "Sun", weekend: true },
] as const

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

function formatMonthShortYear(monthKey: string): string {
  const [y, m] = monthKey.split("-")
  const name = MONTH_SHORT[Number(m) - 1] ?? monthKey
  return `${name} ${y ?? ""}`.trim()
}

function formatBillShortDate(orderDate: string): string {
  const parts = orderDate.split("-")
  if (parts.length !== 3) return orderDate
  const m = MONTH_SHORT[Number(parts[1]) - 1]
  const d = Number(parts[2])
  if (!m || Number.isNaN(d)) return orderDate
  return `${m} ${d}`
}

function buildPublicReceiptUrl(
  publicId: string,
  imageObjectKey: string | null
): string | null {
  if (!imageObjectKey) return null
  return `/api/public/bills/${encodeURIComponent(publicId)}/image?v=${encodeURIComponent(imageObjectKey)}`
}

interface RawSnapshotData {
  playerRows: Array<{
    id: string
    name: string
    email: string | null
    userId: string | null
    archivedAt: string | null
    takesRounding: boolean
    avatarObjectKey: string | null
    avatarBanned: boolean
    nameLocked: boolean
  }>
  publishedBills: Array<{
    id: string
    publicId: string
    merchant: string
    title: string | null
    orderDate: string
    publishedAt: string | null
    createdAt: string
    sourceSubtotal: number
    finalTotal: number
    imageObjectKey: string | null
  }>
  bpStatusRows: Array<{
    billPlayerId: string
    billId: string
    playerId: string | null
    alias: string
    sortOrder: number
    itemSubtotal: number
    adjustmentTotal: number
    shareAmount: number
    paymentStatus: string | null
    paidAmount: number | null
    paidAt: string | null
  }>
  pendingClaims: Array<{
    id: string
    playerId: string
    claimedAmount: number
    expectedOwedAtClaim: number
    createdAt: string
  }>
}

/**
 * Fetches the entire summary dataset in a single `db.batch([...])` round-trip.
 * Strictly reads ONLY `players`, `bills` (via `bills_status_archived_date_idx`),
 * `bill_players` (split snapshot), `payment_statuses`, and pending `transfer_claims`
 * (via `transfer_claims_pending_idx`). NEVER touches `items`, `item_allocations`,
 * `adjustments`, or `adjustment_allocations`.
 */
async function loadSummarySnapshot(db: Database): Promise<RawSnapshotData> {
  const [playerRows, publishedBills, bpStatusRows, pendingClaims] =
    await db.batch([
      db
        .select({
          id: players.id,
          name: players.name,
          email: players.email,
          userId: players.userId,
          archivedAt: players.archivedAt,
          takesRounding: players.takesRounding,
          avatarObjectKey: players.avatarObjectKey,
          avatarBanned: players.avatarBanned,
          nameLocked: players.nameLocked,
        })
        .from(players)
        .orderBy(asc(players.name)),
      db
        .select({
          id: bills.id,
          publicId: bills.publicId,
          merchant: bills.merchant,
          title: bills.title,
          orderDate: bills.orderDate,
          publishedAt: bills.publishedAt,
          createdAt: bills.createdAt,
          sourceSubtotal: bills.sourceSubtotal,
          finalTotal: bills.finalTotal,
          imageObjectKey: bills.imageObjectKey,
        })
        .from(bills)
        .where(and(eq(bills.status, "published"), isNull(bills.archivedAt)))
        .orderBy(desc(bills.orderDate)),
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
        .innerJoin(bills, eq(bills.id, billPlayers.billId))
        .leftJoin(
          paymentStatuses,
          eq(paymentStatuses.billPlayerId, billPlayers.id)
        )
        .where(and(eq(bills.status, "published"), isNull(bills.archivedAt)))
        .orderBy(asc(billPlayers.sortOrder)),
      db
        .select({
          id: transferClaims.id,
          playerId: transferClaims.playerId,
          claimedAmount: transferClaims.claimedAmount,
          expectedOwedAtClaim: transferClaims.expectedOwedAtClaim,
          createdAt: transferClaims.createdAt,
        })
        .from(transferClaims)
        .where(eq(transferClaims.status, "pending"))
        .orderBy(desc(transferClaims.createdAt)),
    ])

  return {
    playerRows,
    publishedBills,
    bpStatusRows,
    pendingClaims,
  }
}

function resolveTargetMonth(
  requestedMonth: string | null | undefined,
  availableMonths: string[]
): string {
  if (requestedMonth && MONTH_KEY_RE.test(requestedMonth)) {
    return requestedMonth
  }
  return availableMonths[0] ?? todayJakarta().slice(0, 7)
}

function buildBillSummaries(
  rawBills: RawSnapshotData["publishedBills"],
  bpStatusRows: RawSnapshotData["bpStatusRows"],
  playerRows?: RawSnapshotData["playerRows"]
): BillSummary[] {
  const playerNameById = new Map(
    (playerRows ?? []).map((p) => [p.id, p.name] as const)
  )
  const splitsByBill = new Map<string, BillSplitSummary[]>()
  for (const row of bpStatusRows) {
    const list = splitsByBill.get(row.billId) ?? []
    list.push({
      billPlayerId: row.billPlayerId,
      playerId: row.playerId ?? row.billPlayerId,
      name: (row.playerId && playerNameById.get(row.playerId)) || row.alias,
      items: [],
      itemSubtotal: row.itemSubtotal,
      discountShare: row.adjustmentTotal < 0 ? row.adjustmentTotal : 0,
      feeShare: row.adjustmentTotal > 0 ? row.adjustmentTotal : 0,
      totalOwed: row.shareAmount,
      status: row.paymentStatus === "paid" ? "paid" : "unpaid",
      paidAmount: row.paidAmount,
      paidAt: row.paidAt,
    })
    splitsByBill.set(row.billId, list)
  }

  return rawBills.map((b) => {
    const splits = splitsByBill.get(b.id) ?? []
    const paidCount = splits.filter((s) => s.status === "paid").length
    const netAdj = b.finalTotal - b.sourceSubtotal
    return {
      id: b.id,
      publicId: b.publicId,
      merchant: b.merchant,
      title: b.title,
      orderDate: b.orderDate,
      status: "published",
      archivedAt: null,
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
  })
}

function resolveBadgeStickerSrc(
  kind: "spending" | "tips",
  monthKey: string
): string | null {
  return monthKey >= "2026-08" && monthKey <= "2027-08"
    ? `/stickers/player-badges/${kind}-${monthKey}.webp`
    : null
}

export interface MonthlyBadgeBillInput {
  id: string
  orderDate: string
}

export interface MonthlyBadgeSplitInput {
  billId: string
  playerId: string | null
  shareAmount: number
  paymentStatus: string | null
  paidAmount: number | null
}

export interface MonthlyBadgePlayerInput {
  id: string
  name: string
}

/**
 * Computes every player's monthly #1 spending and tipping badges in a single
 * in-memory pass over the already-loaded summary snapshot (zero extra D1 queries).
 * Ties break alphabetically by player name to match `getSpendingLeaderboard` and
 * `getTipLeaderboard`. Returned badge arrays are ordered newest month first.
 */
export function computeMonthlyBadgesByPlayer(input: {
  players: readonly MonthlyBadgePlayerInput[]
  bills: readonly MonthlyBadgeBillInput[]
  splits: readonly MonthlyBadgeSplitInput[]
}): Map<string, PlayerMonthlyBadge[]> {
  const playerNameById = new Map<string, string>()
  for (const p of input.players) {
    playerNameById.set(p.id, p.name)
  }

  const billMonthById = new Map<string, string>()
  for (const b of input.bills) {
    if (b.orderDate.length >= 7) {
      billMonthById.set(b.id, b.orderDate.slice(0, 7))
    }
  }

  const monthStats = new Map<
    string,
    Map<string, { spend: number; tips: number }>
  >()

  for (const row of input.splits) {
    if (!row.playerId || !playerNameById.has(row.playerId)) continue
    const monthKey = billMonthById.get(row.billId)
    if (!monthKey) continue

    let perPlayer = monthStats.get(monthKey)
    if (!perPlayer) {
      perPlayer = new Map()
      monthStats.set(monthKey, perPlayer)
    }
    const curr = perPlayer.get(row.playerId) ?? { spend: 0, tips: 0 }
    curr.spend += row.shareAmount
    if (row.paymentStatus === "paid" && row.paidAmount !== null) {
      const tip = Math.max(0, row.paidAmount - row.shareAmount)
      if (tip > 0) curr.tips += tip
    }
    perPlayer.set(row.playerId, curr)
  }

  const sortedMonths = [...monthStats.keys()].sort((a, b) => b.localeCompare(a))
  const badgesByPlayer = new Map<string, PlayerMonthlyBadge[]>()

  const pushBadge = (playerId: string, badge: PlayerMonthlyBadge) => {
    const list = badgesByPlayer.get(playerId)
    if (list) {
      list.push(badge)
    } else {
      badgesByPlayer.set(playerId, [badge])
    }
  }

  for (const monthKey of sortedMonths) {
    const perPlayer = monthStats.get(monthKey)!
    let topSpendId: string | null = null
    let topSpendName = ""
    let topSpendAmount = 0

    let topTipId: string | null = null
    let topTipName = ""
    let topTipAmount = 0

    for (const [playerId, st] of perPlayer.entries()) {
      const name = playerNameById.get(playerId) ?? ""
      if (
        st.spend > 0 &&
        (st.spend > topSpendAmount ||
          (st.spend === topSpendAmount &&
            topSpendId !== null &&
            name.localeCompare(topSpendName) < 0))
      ) {
        topSpendAmount = st.spend
        topSpendId = playerId
        topSpendName = name
      }

      if (
        st.tips > 0 &&
        (st.tips > topTipAmount ||
          (st.tips === topTipAmount &&
            topTipId !== null &&
            name.localeCompare(topTipName) < 0))
      ) {
        topTipAmount = st.tips
        topTipId = playerId
        topTipName = name
      }
    }

    const monthLabel = formatMonthShortYear(monthKey)
    if (topSpendId) {
      pushBadge(topSpendId, {
        kind: "spending",
        monthKey,
        monthLabel,
        amount: topSpendAmount,
        stickerSrc: resolveBadgeStickerSrc("spending", monthKey),
      })
    }
    if (topTipId) {
      pushBadge(topTipId, {
        kind: "tips",
        monthKey,
        monthLabel,
        amount: topTipAmount,
        stickerSrc: resolveBadgeStickerSrc("tips", monthKey),
      })
    }
  }

  return badgesByPlayer
}

export interface StandingBillInput {
  id: string
  merchant: string
  orderDate: string
  publishedAt?: string | null
  createdAt?: string | null
}

export interface StandingSplitInput {
  billPlayerId: string
  billId: string
  playerId: string | null
  shareAmount: number
  paymentStatus: string | null
  paidAmount: number | null
  paidAt: string | null
}

interface RankedEntry {
  id: string
  name: string
  amount: number
}

function buildRankedBoard(
  totals: Map<string, number>,
  playerNameById: Map<string, string>
): RankedEntry[] {
  const entries: RankedEntry[] = []
  for (const [id, amount] of totals.entries()) {
    if (amount <= 0) continue
    const name = playerNameById.get(id)
    if (!name) continue
    entries.push({ id, name, amount })
  }
  entries.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  return entries
}

function evaluateBoardStep(params: {
  board: StandingBoard
  monthKey: string
  monthLabel: string
  prevBoard: RankedEntry[]
  nextBoard: RankedEntry[]
  prevTotals: Map<string, number>
  eventKey: string
  triggerLabel: string
  occurredAt: string
}): StandingChangeSummary | null {
  const {
    board,
    monthKey,
    monthLabel,
    prevBoard,
    nextBoard,
    prevTotals,
    eventKey,
    triggerLabel,
    occurredAt,
  } = params

  if (prevBoard.length === 0 || nextBoard.length === 0) return null

  const prevRankById = new Map<string, number>()
  prevBoard.forEach((e, i) => prevRankById.set(e.id, i + 1))

  const nextRankById = new Map<string, number>()
  nextBoard.forEach((e, i) => nextRankById.set(e.id, i + 1))

  const allMoves: StandingMove[] = []
  for (const entry of nextBoard) {
    const newRank = nextRankById.get(entry.id)!
    const prevRank = prevRankById.get(entry.id) ?? null
    const prevAmount = prevTotals.get(entry.id) ?? 0
    if (prevRank !== newRank) {
      allMoves.push({
        playerId: entry.id,
        name: entry.name,
        prevRank,
        newRank,
        prevAmount,
        newAmount: entry.amount,
      })
    }
  }

  const climbers = allMoves
    .filter((m) =>
      m.prevRank === null ? m.newRank < nextBoard.length : m.newRank < m.prevRank
    )
    .sort((a, b) => a.newRank - b.newRank)
  const displaced = allMoves
    .filter((m) => m.prevRank !== null && m.newRank > m.prevRank)
    .sort((a, b) => a.newRank - b.newRank)

  const orderedMoves = [...climbers, ...displaced].slice(0, 6)
  const stickerSrc = resolveBadgeStickerSrc(board, monthKey)

  // 1. Crown takeover (#1 changed)
  if (prevBoard[0].id !== nextBoard[0].id) {
    const actor = nextBoard[0]
    const displacedLeader = prevBoard[0]
    const gapAmount = nextBoard[1] ? actor.amount - nextBoard[1].amount : 0
    return {
      id: `${monthKey}:${board}:crown:${actor.id}:${displacedLeader.id}:${eventKey}`,
      monthKey,
      monthLabel,
      board,
      kind: "crown",
      actorId: actor.id,
      actorName: actor.name,
      targetId: displacedLeader.id,
      targetName: displacedLeader.name,
      prevRank: prevRankById.get(actor.id) ?? null,
      newRank: 1,
      amount: actor.amount,
      gapAmount,
      triggerLabel,
      occurredAt,
      stickerSrc,
      moves: orderedMoves,
    }
  }

  // 2. Close chase (#2 closed within tight striking distance of #1)
  if (nextBoard.length >= 2) {
    const leader = nextBoard[0]
    const challenger = nextBoard[1]
    const prevChallengerAmount = prevTotals.get(challenger.id) ?? 0
    const gap = leader.amount - challenger.amount
    const tightAbs = board === "tips" ? 5_000 : 10_000
    const tightRatio = board === "tips" ? 0.15 : 0.12
    const isTight =
      gap > 0 && (gap <= tightAbs || gap / leader.amount <= tightRatio)
    const prevLeaderAmount = prevTotals.get(leader.id) ?? 0
    const prevGap = prevLeaderAmount - prevChallengerAmount
    const closedGap =
      challenger.amount > prevChallengerAmount &&
      (prevBoard.length < 2 || prevGap > gap)

    if (isTight && closedGap) {
      const chaseMoves: StandingMove[] =
        orderedMoves.length > 0
          ? orderedMoves
          : [
              {
                playerId: challenger.id,
                name: challenger.name,
                prevRank: prevRankById.get(challenger.id) ?? null,
                newRank: 2,
                prevAmount: prevChallengerAmount,
                newAmount: challenger.amount,
              },
              {
                playerId: leader.id,
                name: leader.name,
                prevRank: 1,
                newRank: 1,
                prevAmount: prevLeaderAmount,
                newAmount: leader.amount,
              },
            ]
      return {
        id: `${monthKey}:${board}:close-chase:${challenger.id}:${leader.id}:${eventKey}`,
        monthKey,
        monthLabel,
        board,
        kind: "close-chase",
        actorId: challenger.id,
        actorName: challenger.name,
        targetId: leader.id,
        targetName: leader.name,
        prevRank: prevRankById.get(challenger.id) ?? null,
        newRank: 2,
        amount: challenger.amount,
        gapAmount: gap,
        triggerLabel,
        occurredAt,
        stickerSrc,
        moves: chaseMoves,
      }
    }
  }

  // 3. Rank overtake (someone climbed past another player)
  if (climbers.length > 0) {
    const topClimber = climbers[0]
    const passed =
      displaced.find((d) => (d.prevRank ?? Infinity) <= topClimber.newRank) ??
      displaced[0] ??
      null
    return {
      id: `${monthKey}:${board}:overtake:${topClimber.playerId}:${passed?.playerId ?? "none"}:${eventKey}`,
      monthKey,
      monthLabel,
      board,
      kind: "overtake",
      actorId: topClimber.playerId,
      actorName: topClimber.name,
      targetId: passed?.playerId ?? null,
      targetName: passed?.name ?? null,
      prevRank: topClimber.prevRank,
      newRank: topClimber.newRank,
      amount: topClimber.newAmount,
      gapAmount:
        topClimber.newRank > 1 && nextBoard[topClimber.newRank - 2]
          ? nextBoard[topClimber.newRank - 2].amount - topClimber.newAmount
          : 0,
      triggerLabel,
      occurredAt,
      stickerSrc,
      moves: orderedMoves,
    }
  }

  return null
}

const STANDING_KIND_PRIORITY: Record<StandingChangeKind, number> = {
  crown: 3,
  "close-chase": 2,
  overtake: 1,
}

/**
 * Reconstructs the latest notable standing change (crown takeover, close chase,
 * or rank overtake) in the target month across Spending and Tipping in pure
 * TypeScript over the already-loaded summary snapshot (zero extra D1 queries).
 */
export function computeLatestStandingChange(input: {
  players: readonly MonthlyBadgePlayerInput[]
  bills: readonly StandingBillInput[]
  splits: readonly StandingSplitInput[]
  targetMonth: string
}): StandingChangeSummary | null {
  const { targetMonth } = input
  const monthBills = input.bills
    .filter((b) => b.orderDate.startsWith(targetMonth))
    .sort(
      (a, b) =>
        a.orderDate.localeCompare(b.orderDate) ||
        (a.publishedAt ?? a.createdAt ?? "").localeCompare(
          b.publishedAt ?? b.createdAt ?? ""
        ) ||
        a.id.localeCompare(b.id)
    )

  if (monthBills.length === 0) return null

  const playerNameById = new Map<string, string>()
  for (const p of input.players) {
    playerNameById.set(p.id, p.name)
  }

  const billById = new Map<string, StandingBillInput>()
  for (const b of monthBills) {
    billById.set(b.id, b)
  }

  const splitsByBillId = new Map<string, StandingSplitInput[]>()
  const tippedSplits: Array<{
    split: StandingSplitInput
    bill: StandingBillInput
    tip: number
    timestamp: string
  }> = []

  for (const s of input.splits) {
    if (!s.playerId || !playerNameById.has(s.playerId)) continue
    const bill = billById.get(s.billId)
    if (!bill) continue

    const list = splitsByBillId.get(s.billId)
    if (list) list.push(s)
    else splitsByBillId.set(s.billId, [s])

    if (s.paymentStatus === "paid" && s.paidAmount !== null) {
      const tip = Math.max(0, s.paidAmount - s.shareAmount)
      if (tip > 0) {
        tippedSplits.push({
          split: s,
          bill,
          tip,
          timestamp: s.paidAt || bill.publishedAt || bill.createdAt || bill.orderDate,
        })
      }
    }
  }

  const monthLabel = formatMonthShortYear(targetMonth)

  // 1. Walk spending bills chronologically
  let latestSpend: { event: StandingChangeSummary; sortTime: string } | null =
    null
  const spendTotals = new Map<string, number>()
  let prevSpendBoard: RankedEntry[] = []

  for (const bill of monthBills) {
    const billSplits = splitsByBillId.get(bill.id) ?? []
    if (billSplits.length === 0) continue

    const prevSnapshot = new Map(spendTotals)
    for (const s of billSplits) {
      if (!s.playerId || s.shareAmount <= 0) continue
      spendTotals.set(
        s.playerId,
        (spendTotals.get(s.playerId) ?? 0) + s.shareAmount
      )
    }

    const nextBoard = buildRankedBoard(spendTotals, playerNameById)
    const occurredAt = bill.publishedAt || bill.createdAt || bill.orderDate
    const change = evaluateBoardStep({
      board: "spending",
      monthKey: targetMonth,
      monthLabel,
      prevBoard: prevSpendBoard,
      nextBoard,
      prevTotals: prevSnapshot,
      eventKey: bill.id,
      triggerLabel: bill.merchant,
      occurredAt,
    })
    if (change) {
      latestSpend = { event: change, sortTime: occurredAt }
    }
    prevSpendBoard = nextBoard
  }

  // 2. Walk tipped payments chronologically (batched by timestamp so Collect All is atomic)
  let latestTip: { event: StandingChangeSummary; sortTime: string } | null = null
  if (tippedSplits.length > 0) {
    tippedSplits.sort(
      (a, b) =>
        a.timestamp.localeCompare(b.timestamp) ||
        a.split.billPlayerId.localeCompare(b.split.billPlayerId)
    )

    const batches: Array<{
      timestamp: string
      eventKey: string
      triggerLabel: string
      items: typeof tippedSplits
    }> = []

    for (const item of tippedSplits) {
      const last = batches[batches.length - 1]
      if (last && last.timestamp === item.timestamp) {
        last.items.push(item)
      } else {
        batches.push({
          timestamp: item.timestamp,
          eventKey: item.split.billPlayerId,
          triggerLabel: item.bill.merchant,
          items: [item],
        })
      }
    }

    const tipTotals = new Map<string, number>()
    let prevTipBoard: RankedEntry[] = []

    for (const batch of batches) {
      const prevSnapshot = new Map(tipTotals)
      for (const item of batch.items) {
        if (!item.split.playerId) continue
        tipTotals.set(
          item.split.playerId,
          (tipTotals.get(item.split.playerId) ?? 0) + item.tip
        )
      }
      const nextBoard = buildRankedBoard(tipTotals, playerNameById)
      const change = evaluateBoardStep({
        board: "tips",
        monthKey: targetMonth,
        monthLabel,
        prevBoard: prevTipBoard,
        nextBoard,
        prevTotals: prevSnapshot,
        eventKey: batch.eventKey,
        triggerLabel: batch.triggerLabel,
        occurredAt: batch.timestamp,
      })
      if (change) {
        latestTip = { event: change, sortTime: batch.timestamp }
      }
      prevTipBoard = nextBoard
    }
  }

  if (!latestSpend) return latestTip?.event ?? null
  if (!latestTip) return latestSpend.event

  const timeCmp = latestTip.sortTime.localeCompare(latestSpend.sortTime)
  if (timeCmp > 0) return latestTip.event
  if (timeCmp < 0) return latestSpend.event

  const prioCmp =
    STANDING_KIND_PRIORITY[latestTip.event.kind] -
    STANDING_KIND_PRIORITY[latestSpend.event.kind]
  return prioCmp >= 0 ? latestTip.event : latestSpend.event
}

function buildPlayerSummaries(
  snapshot: RawSnapshotData,
  allBills: BillSummary[],
  scope: "monthly" | "all-time",
  targetMonth: string,
  monthlyBadgesByPlayer?: Map<string, PlayerMonthlyBadge[]>
): PlayerSummary[] {
  const billById = new Map(allBills.map((b) => [b.id, b]))
  const claimByPlayerId = new Map<string, RawSnapshotData["pendingClaims"][number]>()
  for (const c of snapshot.pendingClaims) {
    if (!claimByPlayerId.has(c.playerId)) {
      claimByPlayerId.set(c.playerId, c)
    }
  }

  // Track unpaid bills across ALL published bills (not restricted to month)
  const unpaidByPlayerId = new Map<string, UnpaidBillItem[]>()
  for (const bill of [...allBills].sort((a, b) =>
    a.orderDate.localeCompare(b.orderDate)
  )) {
    for (const s of bill.splits) {
      if (s.status !== "unpaid") continue
      const list = unpaidByPlayerId.get(s.playerId) ?? []
      list.push({
        billPlayerId: s.billPlayerId,
        billId: bill.id,
        publicId: bill.publicId,
        merchant: bill.merchant,
        date: formatBillShortDate(bill.orderDate),
        orderDate: bill.orderDate,
        itemsSummary: bill.title || bill.merchant,
        amount: s.totalOwed,
      })
      unpaidByPlayerId.set(s.playerId, list)
    }
  }

  // Scoped metrics (monthly or all-time)
  const statsByPlayer = new Map<
    string,
    {
      spend: number
      tips: number
      orders: number
      tippedBills: number
      savedDiscount: number
      menuSubtotal: number
      biggestSingleBill: number
      bestTip: number
      bestTipMerchant: string | null
    }
  >()

  for (const row of snapshot.bpStatusRows) {
    if (!row.playerId) continue
    const bill = billById.get(row.billId)
    if (!bill) continue
    if (scope === "monthly" && !bill.orderDate.startsWith(targetMonth)) {
      continue
    }
    const curr = statsByPlayer.get(row.playerId) ?? {
      spend: 0,
      tips: 0,
      orders: 0,
      tippedBills: 0,
      savedDiscount: 0,
      menuSubtotal: 0,
      biggestSingleBill: 0,
      bestTip: 0,
      bestTipMerchant: null,
    }
    curr.spend += row.shareAmount
    curr.orders += 1
    curr.menuSubtotal += row.itemSubtotal
    if (row.adjustmentTotal < 0) {
      curr.savedDiscount += Math.abs(row.adjustmentTotal)
    }
    if (row.shareAmount > curr.biggestSingleBill) {
      curr.biggestSingleBill = row.shareAmount
    }
    if (row.paymentStatus === "paid" && row.paidAmount !== null) {
      const tip = Math.max(0, row.paidAmount - row.shareAmount)
      if (tip > 0) {
        curr.tips += tip
        curr.tippedBills += 1
        if (tip > curr.bestTip) {
          curr.bestTip = tip
          curr.bestTipMerchant = bill.merchant
        }
      }
    }
    statsByPlayer.set(row.playerId, curr)
  }

  // Compute badges among players with activity in scope
  let topSpenderId: string | null = null
  let topSpendVal = 0
  let topTipperId: string | null = null
  let topTipVal = 0
  let topDiscountId: string | null = null
  let topDiscountPct = 0
  let topLoyalId: string | null = null
  let topOrders = 0
  let topStrikeId: string | null = null
  let topStrikeVal = 0

  for (const [pid, st] of statsByPlayer.entries()) {
    if (st.spend > topSpendVal) {
      topSpendVal = st.spend
      topSpenderId = pid
    }
    if (st.tips > topTipVal) {
      topTipVal = st.tips
      topTipperId = pid
    }
    const pct =
      st.menuSubtotal > 0 ? (st.savedDiscount / st.menuSubtotal) * 100 : 0
    if (st.orders >= 2 && pct > topDiscountPct) {
      topDiscountPct = pct
      topDiscountId = pid
    }
    if (st.orders > topOrders) {
      topOrders = st.orders
      topLoyalId = pid
    }
    if (st.biggestSingleBill > topStrikeVal) {
      topStrikeVal = st.biggestSingleBill
      topStrikeId = pid
    }
  }

  const badgeForPlayer = (pid: string): EarnedBadge | null => {
    if (pid === topSpenderId && topSpendVal > 0) return "Top spender"
    if (pid === topTipperId && topTipVal > 0) return "Big heart"
    if (pid === topStrikeId && topStrikeVal > 0) return "Biggest strike"
    if (pid === topDiscountId && topDiscountPct > 0) return "Discount hunter"
    if (pid === topLoyalId && topOrders > 1) return "Loyal"
    return null
  }

  const badgesMap =
    monthlyBadgesByPlayer ??
    computeMonthlyBadgesByPlayer({
      players: snapshot.playerRows,
      bills: snapshot.publishedBills,
      splits: snapshot.bpStatusRows,
    })

  const nowMs = Date.now()
  return snapshot.playerRows
    .filter((p) => p.archivedAt === null || (unpaidByPlayerId.get(p.id)?.length ?? 0) > 0)
    .map((p) => {
      const st = statsByPlayer.get(p.id)
      const spend = st?.spend ?? 0
      const tips = st?.tips ?? 0
      const orders = st?.orders ?? 0
      const savedDiscount = st?.savedDiscount ?? 0
      const menuSub = st?.menuSubtotal ?? 0
      const savedPct =
        menuSub > 0 ? Math.round((savedDiscount / menuSub) * 1000) / 10 : 0
      const claim = claimByPlayerId.get(p.id)
      const currentMonthBadges = (badgesMap.get(p.id) ?? []).filter(
        (b) => b.monthKey === targetMonth
      )

      return {
        id: p.id,
        name: p.name,
        handle: makePlayerHandle(p.name),
        avatar: makePlayerInitials(p.name),
        avatarUrl: buildAvatarPublicUrl(p.id, p.avatarObjectKey),
        avatarBanned: p.avatarBanned,
        nameLocked: p.nameLocked,
        guildTitle:
          tips > 0 && p.id === topTipperId
            ? "Sultan Tip Jar"
            : orders >= 5
              ? "Raid Veteran"
              : "Lunch Raider",
        level: Math.max(1, orders),
        monthlySpend: spend,
        monthlyTips: tips,
        ordersCount: orders,
        tippedBillsCount: st?.tippedBills ?? 0,
        savedDiscount,
        savedPct,
        badge: badgeForPlayer(p.id),
        currentMonthBadges,
        bestTipNote: st?.bestTipMerchant
          ? `Best tip on ${st.bestTipMerchant}`
          : "No tips logged yet",
        // Privacy: public endpoints never expose raw email addresses
        linkedEmail: null,
        userId: p.userId ? "linked" : null,
        archivedAt: p.archivedAt,
        takesRounding: p.takesRounding,
        unpaidBills: unpaidByPlayerId.get(p.id) ?? [],
        pendingClaim: claim
          ? {
              id: claim.id,
              claimedAmount: claim.claimedAmount,
              expectedOwedAtClaim: claim.expectedOwedAtClaim,
              submittedAt: formatRelativeTime(claim.createdAt, nowMs),
              createdAt: claim.createdAt,
            }
          : null,
      }
    })
}

export async function getHomeFeed(
  db: Database,
  requestedMonth?: string | null
): Promise<HomeFeedResponse> {
  const snapshot = await loadSummarySnapshot(db)
  const allBills = buildBillSummaries(
    snapshot.publishedBills,
    snapshot.bpStatusRows,
    snapshot.playerRows
  )

  const monthSet = new Set<string>()
  for (const b of allBills) {
    if (b.orderDate.length >= 7) monthSet.add(b.orderDate.slice(0, 7))
  }
  const availableMonths = [...monthSet].sort((a, b) => b.localeCompare(a))
  const month = resolveTargetMonth(requestedMonth, availableMonths)

  const monthBills = allBills.filter((b) => b.orderDate.startsWith(month))
  const unpaidBills = allBills.filter((b) => b.paidCount < b.totalPlayers)
  const playerSummaries = buildPlayerSummaries(
    snapshot,
    allBills,
    "monthly",
    month
  )

  const totalBilled = monthBills.reduce((s, b) => s + b.finalTotal, 0)
  const totalTipPot = playerSummaries.reduce((s, p) => s + p.monthlyTips, 0)
  const tippersCount = playerSummaries.filter((p) => p.monthlyTips > 0).length
  const openDebtors = playerSummaries.filter((p) => p.unpaidBills.length > 0)
  const totalOutstanding = openDebtors.reduce(
    (s, p) => s + p.unpaidBills.reduce((acc, u) => acc + u.amount, 0),
    0
  )

  const latestStandingChange = computeLatestStandingChange({
    players: snapshot.playerRows,
    bills: snapshot.publishedBills,
    splits: snapshot.bpStatusRows,
    targetMonth: month,
  })

  return {
    month,
    availableMonths,
    players: playerSummaries,
    bills: monthBills,
    unpaidBills,
    totals: {
      totalBilled,
      totalTipPot,
      tippersCount,
      totalOutstanding,
      openDebtorsCount: openDebtors.length,
    },
    latestStandingChange,
  }
}

export async function getRanksFeed(
  db: Database,
  scope: "monthly" | "all-time",
  requestedMonth?: string | null
): Promise<RanksResponse> {
  const snapshot = await loadSummarySnapshot(db)
  const allBills = buildBillSummaries(
    snapshot.publishedBills,
    snapshot.bpStatusRows,
    snapshot.playerRows
  )

  const monthSet = new Set<string>()
  for (const b of allBills) {
    if (b.orderDate.length >= 7) monthSet.add(b.orderDate.slice(0, 7))
  }
  const availableMonths = [...monthSet].sort((a, b) => b.localeCompare(a))
  const month = resolveTargetMonth(requestedMonth, availableMonths)

  const playerSummaries = buildPlayerSummaries(snapshot, allBills, scope, month)
  const totalTipPot = playerSummaries.reduce((s, p) => s + p.monthlyTips, 0)

  return {
    scope,
    month,
    availableMonths,
    players: playerSummaries,
    totalTipPot,
  }
}

export async function getTipWall(
  db: Database,
  requestedMonth?: string | null
) {
  const ranks = await getRanksFeed(db, "monthly", requestedMonth)
  const leaderboard = getTipLeaderboard(ranks.players).filter(
    (p) => p.monthlyTips > 0
  )
  return {
    month: ranks.month,
    availableMonths: ranks.availableMonths,
    totalTipPot: ranks.totalTipPot,
    tippersCount: leaderboard.length,
    tippers: leaderboard,
  }
}

/**
 * Player Detail + 4-part spending habit insights & unpaid tabs.
 * Computed strictly from `bills + bill_players + payment_statuses` (zero scans
 * of `items` / `*_allocations`).
 */
export async function getPlayerDetail(
  db: Database,
  playerId: string,
  requestedMonth?: string | null
): Promise<PlayerDetailResponse> {
  const snapshot = await loadSummarySnapshot(db)
  const exists = snapshot.playerRows.some((p) => p.id === playerId)
  if (!exists) {
    throw new ServiceError(404, "PLAYER_NOT_FOUND", "Player not found.")
  }

  const allBills = buildBillSummaries(
    snapshot.publishedBills,
    snapshot.bpStatusRows,
    snapshot.playerRows
  )
  const monthSet = new Set<string>()
  for (const b of allBills) {
    if (b.orderDate.length >= 7) monthSet.add(b.orderDate.slice(0, 7))
  }
  const availableMonths = [...monthSet].sort((a, b) => b.localeCompare(a))
  const month = resolveTargetMonth(requestedMonth, availableMonths)

  const monthlyBadgesByPlayer = computeMonthlyBadgesByPlayer({
    players: snapshot.playerRows,
    bills: snapshot.publishedBills,
    splits: snapshot.bpStatusRows,
  })

  // Use all-time summaries for lifetime dossier stats & ranks
  const allTimePlayers = buildPlayerSummaries(
    snapshot,
    allBills,
    "all-time",
    month,
    monthlyBadgesByPlayer
  )
  const player = allTimePlayers.find((p) => p.id === playerId)
  if (!player) {
    throw new ServiceError(404, "PLAYER_NOT_FOUND", "Player not found.")
  }

  const spendBoard = getSpendingLeaderboard(allTimePlayers)
  const tipBoard = getTipLeaderboard(allTimePlayers)
  const topSpend = spendBoard[0]?.monthlySpend ?? 0
  const totalTipPot = allTimePlayers.reduce((s, p) => s + p.monthlyTips, 0)
  const spendRank = spendBoard.findIndex((p) => p.id === playerId) + 1
  const tipRank = tipBoard.findIndex((p) => p.id === playerId) + 1

  const orderHistory: Array<{ bill: BillSummary; split: BillSplitSummary }> = []
  for (const bill of allBills) {
    const split = bill.splits.find((s) => s.playerId === playerId)
    if (split) {
      orderHistory.push({ bill, split })
    }
  }

  // 1. Monthly spend series (up to last 6 active months)
  const monthBuckets = new Map<
    string,
    { spend: number; tips: number; saved: number; orders: number }
  >()
  for (const { bill, split } of orderHistory) {
    const key = bill.orderDate.slice(0, 7)
    const curr = monthBuckets.get(key) ?? {
      spend: 0,
      tips: 0,
      saved: 0,
      orders: 0,
    }
    curr.spend += split.totalOwed
    curr.orders += 1
    curr.saved += Math.abs(split.discountShare)
    if (split.status === "paid" && split.paidAmount !== null) {
      curr.tips += Math.max(0, split.paidAmount - split.totalOwed)
    }
    monthBuckets.set(key, curr)
  }
  const recentMonthKeys = [...monthBuckets.keys()]
    .sort((a, b) => a.localeCompare(b))
    .slice(-6)
  const monthlySeries = recentMonthKeys.map((key) => {
    const b = monthBuckets.get(key)!
    return {
      key,
      label: shortMonthLabel(key),
      spend: b.spend,
      tips: b.tips,
      saved: b.saved,
      orders: b.orders,
    }
  })

  // 2. Day-of-week rhythm
  const weekdayRhythm = WEEKDAYS.map((d) => ({
    ...d,
    orders: 0,
    spend: 0,
  }))
  for (const { bill, split } of orderHistory) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bill.orderDate)
    if (!m) continue
    const dt = new Date(
      Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    )
    const dayNum = dt.getUTCDay()
    const bucket = weekdayRhythm.find((w) => w.idx === dayNum)
    if (bucket) {
      bucket.orders += 1
      bucket.spend += split.totalOwed
    }
  }

  // 3. Real cost breakdown (from bill_players snapshot)
  let menuValue = 0
  let saved = 0
  let fees = 0
  let netBills = 0
  let tips = 0
  for (const { split } of orderHistory) {
    menuValue += split.itemSubtotal
    if (split.discountShare < 0) saved += Math.abs(split.discountShare)
    if (split.feeShare > 0) fees += split.feeShare
    netBills += split.totalOwed
    if (split.status === "paid" && split.paidAmount !== null) {
      tips += Math.max(0, split.paidAmount - split.totalOwed)
    }
  }
  const outOfPocket = netBills + tips
  const savedRate = menuValue > 0 ? Math.round((saved / menuValue) * 100) : 0

  // 4. Merchant split
  const merchantMap = new Map<
    string,
    { merchant: string; orders: number; spend: number }
  >()
  for (const { bill, split } of orderHistory) {
    const curr = merchantMap.get(bill.merchant) ?? {
      merchant: bill.merchant,
      orders: 0,
      spend: 0,
    }
    curr.orders += 1
    curr.spend += split.totalOwed
    merchantMap.set(bill.merchant, curr)
  }
  const merchantSplit = [...merchantMap.values()].sort(
    (a, b) => b.spend - a.spend
  )

  // Companions
  const companionCounts = new Map<string, number>()
  for (const { bill } of orderHistory) {
    for (const s of bill.splits) {
      if (s.playerId === playerId) continue
      companionCounts.set(s.playerId, (companionCounts.get(s.playerId) ?? 0) + 1)
    }
  }
  const playerMap = new Map(allTimePlayers.map((p) => [p.id, p]))
  const companions = [...companionCounts.entries()]
    .map(([pid, billCount]) => {
      const target = playerMap.get(pid)
      return target ? { player: target, billCount } : null
    })
    .filter((x): x is { player: PlayerSummary; billCount: number } => x !== null)
    .sort((a, b) => b.billCount - a.billCount)

  // Monthly #1 badges across all months (computed in a single pass above)
  const monthlyBadges: PlayerMonthlyBadge[] =
    monthlyBadgesByPlayer.get(playerId) ?? []

  return {
    player,
    spendRank,
    tipRank,
    topSpend,
    totalTipPot,
    orderHistory,
    monthlySeries,
    weekdayRhythm,
    costBreakdown: {
      menuValue,
      saved,
      fees,
      netBills,
      tips,
      outOfPocket,
      savedRate,
    },
    merchantSplit,
    companions,
    monthlyBadges,
  }
}
