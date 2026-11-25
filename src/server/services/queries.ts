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

function buildPlayerSummaries(
  snapshot: RawSnapshotData,
  allBills: BillSummary[],
  scope: "monthly" | "all-time",
  targetMonth: string
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

  // Use all-time summaries for lifetime dossier stats & ranks
  const allTimePlayers = buildPlayerSummaries(
    snapshot,
    allBills,
    "all-time",
    month
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

  // Monthly #1 badges across all months
  const resolveBadgeStickerSrc = (
    kind: "spending" | "tips",
    monthKey: string
  ): string | null =>
    monthKey >= "2026-08" && monthKey <= "2027-08"
      ? `/stickers/player-badges/${kind}-${monthKey}.webp`
      : null

  const monthlyBadges: PlayerMonthlyBadge[] = []
  for (const mk of availableMonths) {
    const mPlayers = buildPlayerSummaries(snapshot, allBills, "monthly", mk)
    const mSpend = getSpendingLeaderboard(mPlayers)
    const mTips = getTipLeaderboard(mPlayers)
    if (mSpend[0]?.id === playerId && mSpend[0].monthlySpend > 0) {
      monthlyBadges.push({
        kind: "spending",
        monthKey: mk,
        monthLabel: formatMonthShortYear(mk),
        amount: mSpend[0].monthlySpend,
        stickerSrc: resolveBadgeStickerSrc("spending", mk),
      })
    }
    if (mTips[0]?.id === playerId && mTips[0].monthlyTips > 0) {
      monthlyBadges.push({
        kind: "tips",
        monthKey: mk,
        monthLabel: formatMonthShortYear(mk),
        amount: mTips[0].monthlyTips,
        stickerSrc: resolveBadgeStickerSrc("tips", mk),
      })
    }
  }

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
