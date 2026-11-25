export type AppUserRole = "guest" | "player" | "admin"

export type PaymentMethodType = "bank" | "ewallet" | "qris"

export interface PaymentMethod {
  id: string
  type: PaymentMethodType
  label: string
  accountNumber: string
  accountHolder: string
  note: string
  isPrimary: boolean
}

export type EarnedBadge =
  | "Top spender"
  | "Big heart"
  | "Discount hunter"
  | "Loyal"
  | "Biggest strike"

export interface UnpaidBillItem {
  billPlayerId: string
  billId: string
  publicId: string
  merchant: string
  date: string
  orderDate: string
  itemsSummary: string
  amount: number
}

export interface PendingClaimSummary {
  id: string
  claimedAmount: number
  expectedOwedAtClaim: number
  submittedAt: string
  createdAt: string
}

export interface PlayerSummary {
  id: string
  name: string
  handle: string
  avatar: string
  avatarUrl: string | null
  avatarBanned: boolean
  nameLocked: boolean
  guildTitle: string
  level: number
  monthlySpend: number
  monthlyTips: number
  ordersCount: number
  tippedBillsCount: number
  savedDiscount: number
  savedPct: number
  badge: EarnedBadge | null
  bestTipNote: string
  linkedEmail: string | null
  userId: string | null
  archivedAt: string | null
  takesRounding: boolean
  unpaidBills: UnpaidBillItem[]
  pendingClaim: PendingClaimSummary | null
}

export interface BillSplitItem {
  name: string
  variantNotes?: string | null
  qty: number
  price: number
}

export interface BillSplitSummary {
  billPlayerId: string
  playerId: string
  name: string
  items: BillSplitItem[]
  itemSubtotal: number
  discountShare: number
  feeShare: number
  totalOwed: number
  status: "paid" | "unpaid"
  paidAmount: number | null
  paidAt: string | null
}

export interface BillSummary {
  id: string
  publicId: string
  merchant: string
  title: string | null
  orderDate: string
  status: "draft" | "published"
  archivedAt: string | null
  sourceSubtotal: number
  voucherDiscount: number
  flatFees: number
  finalTotal: number
  paidCount: number
  totalPlayers: number
  hasReceiptImage: boolean
  receiptUrl: string | null
  splits: BillSplitSummary[]
}

export interface PublicAppSettings {
  appName: string
  tagline: string
  iconUrl: string
}

export interface MeResponse {
  authenticated: boolean
  user: {
    id: string
    name: string
    email: string
    image: string | null
    role: string
  } | null
  isAdmin: boolean
  linkedPlayerId: string | null
  paymentMethods: PaymentMethod[]
}

export interface HomeFeedResponse {
  month: string
  availableMonths: string[]
  players: PlayerSummary[]
  bills: BillSummary[]
  unpaidBills: BillSummary[]
  totals: {
    totalBilled: number
    totalTipPot: number
    tippersCount: number
    totalOutstanding: number
    openDebtorsCount: number
  }
}

export interface RanksResponse {
  scope: "monthly" | "all-time"
  month: string
  availableMonths: string[]
  players: PlayerSummary[]
  totalTipPot: number
}

export interface PlayerMonthlyPoint {
  key: string
  label: string
  spend: number
  tips: number
  saved: number
  orders: number
}

export interface PlayerWeekdayPoint {
  idx: number
  short: string
  weekend: boolean
  orders: number
  spend: number
}

export interface PlayerMonthlyBadge {
  kind: "spending" | "tips"
  monthKey: string
  monthLabel: string
  amount: number
  stickerSrc: string | null
}

export interface PlayerDetailResponse {
  player: PlayerSummary
  spendRank: number
  tipRank: number
  topSpend: number
  totalTipPot: number
  orderHistory: Array<{
    bill: BillSummary
    split: BillSplitSummary
  }>
  monthlySeries: PlayerMonthlyPoint[]
  weekdayRhythm: PlayerWeekdayPoint[]
  costBreakdown: {
    menuValue: number
    saved: number
    fees: number
    netBills: number
    tips: number
    outOfPocket: number
    savedRate: number
  }
  merchantSplit: Array<{
    merchant: string
    orders: number
    spend: number
  }>
  companions: Array<{
    player: PlayerSummary
    billCount: number
  }>
  monthlyBadges: PlayerMonthlyBadge[]
}

export interface AdminUserSummary {
  id: string
  name: string
  email: string
  role: string | null
}

// ---------------------------------------------------------------------------
// Pure UI & leaderboard helpers
// ---------------------------------------------------------------------------

export function makePlayerInitials(name: string): string {
  const clean = name.trim()
  if (!clean) return "??"
  const words = clean.split(/\s+/)
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase()
  }
  return clean.slice(0, 2).toUpperCase()
}

export function makePlayerHandle(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
  return `@${slug || "player"}`
}

export function formatRelativeTime(iso: string, nowMs = Date.now()): string {
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return "just now"
  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000))
  if (diffSec < 60) return "just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

export function getBillRemainingAmount(bill: BillSummary): number {
  return bill.splits
    .filter((s) => s.status === "unpaid")
    .reduce((sum, s) => sum + s.totalOwed, 0)
}

export function tierForSpend(
  spend: number,
  topSpend: number
): "Final Boss" | "Miniboss" | "Regular" | "Rookie" {
  if (topSpend <= 0) return "Rookie"
  const share = spend / topSpend
  if (share >= 0.75) return "Final Boss"
  if (share >= 0.5) return "Miniboss"
  if (share >= 0.25) return "Regular"
  return "Rookie"
}

export function getTipLeaderboard<
  T extends Pick<PlayerSummary, "id" | "name" | "monthlyTips">,
>(players: readonly T[]): T[] {
  return [...players].sort(
    (a, b) => b.monthlyTips - a.monthlyTips || a.name.localeCompare(b.name)
  )
}

export function getSpendingLeaderboard<
  T extends Pick<PlayerSummary, "id" | "name" | "monthlySpend">,
>(players: readonly T[]): T[] {
  return [...players].sort(
    (a, b) => b.monthlySpend - a.monthlySpend || a.name.localeCompare(b.name)
  )
}

export function gapToNextSpend<
  T extends Pick<PlayerSummary, "id" | "monthlySpend">,
>(playerId: string, spendBoard: readonly T[]): { targetRank: number; amount: number } | null {
  const idx = spendBoard.findIndex((p) => p.id === playerId)
  if (idx <= 0) return null
  const above = spendBoard[idx - 1]
  const curr = spendBoard[idx]
  return {
    targetRank: idx,
    amount: Math.max(0, above.monthlySpend - curr.monthlySpend),
  }
}

export function getMonthWeeks(monthKey: string): Array<{
  id: string
  label: string
  range: string
  startDay: number
  endDay: number
}> {
  const [yearStr, monthStr] = monthKey.split("-")
  const year = Number(yearStr) || 2026
  const month = Number(monthStr) || 1
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const monthShort =
    [
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
    ][month - 1] ?? ""

  const ranges: Array<[number, number]> = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, 28],
  ]
  if (daysInMonth >= 29) {
    ranges.push([29, daysInMonth])
  }
  return ranges.map(([startDay, endDay], idx) => ({
    id: `w${idx + 1}`,
    label: `Week ${idx + 1}`,
    range:
      startDay === endDay
        ? `${monthShort} ${startDay}`
        : `${monthShort} ${startDay}-${endDay}`,
    startDay,
    endDay,
  }))
}

export function getBillDayOfMonth(orderDate: string): number {
  const parts = orderDate.split("-")
  return Number(parts[2] ?? 1)
}

export function getPlayerUnpaidTotal(
  player: Pick<PlayerSummary, "unpaidBills">
): number {
  return player.unpaidBills.reduce((sum, b) => sum + b.amount, 0)
}

export function getRoundUpOptions(owed: number): Array<{
  label: string
  amount: number
  tip: number
}> {
  if (owed <= 0) return []
  const round500 = Math.ceil(owed / 500) * 500
  const round1k = Math.ceil(owed / 1000) * 1000
  const round5k = Math.ceil(owed / 5000) * 5000

  const raw = [
    { label: "Exact", amount: owed },
    { label: "Round 500", amount: round500 === owed ? owed + 500 : round500 },
    { label: "Round 1k", amount: round1k === owed ? owed + 1000 : round1k },
    { label: "Round 5k", amount: round5k === owed ? owed + 5000 : round5k },
  ]

  const seen = new Set<number>()
  return raw
    .filter((opt) => {
      if (opt.amount < owed || seen.has(opt.amount)) return false
      seen.add(opt.amount)
      return true
    })
    .map((opt) => ({ ...opt, tip: opt.amount - owed }))
}

export function getTipTargets(
  players: readonly Pick<PlayerSummary, "id" | "name" | "monthlyTips">[],
  playerId: string
): {
  currentRank: number
  toNext: number | null
  nextRank: number | null
  nextName: string | null
  toFirst: number | null
  firstName: string | null
} {
  const board = getTipLeaderboard(players)
  const idx = board.findIndex((p) => p.id === playerId)
  if (idx < 0) {
    return {
      currentRank: board.length,
      toNext: null,
      nextRank: null,
      nextName: null,
      toFirst: null,
      firstName: board[0]?.name ?? null,
    }
  }
  const you = board[idx]
  const leader = board[0]
  if (idx === 0) {
    return {
      currentRank: 1,
      toNext: null,
      nextRank: null,
      nextName: null,
      toFirst: null,
      firstName: leader.name,
    }
  }
  const above = board[idx - 1]
  const toNext = Math.max(1, above.monthlyTips - you.monthlyTips + 1)
  const toFirst = Math.max(1, leader.monthlyTips - you.monthlyTips + 1)
  return {
    currentRank: idx + 1,
    toNext: idx === 1 ? null : toNext,
    nextRank: idx === 1 ? null : idx,
    nextName: idx === 1 ? null : above.name,
    toFirst,
    firstName: leader.name,
  }
}

export function projectTipRank(
  players: readonly Pick<PlayerSummary, "id" | "name" | "monthlyTips">[],
  playerId: string,
  extraTip: number
): {
  currentRank: number
  projectedRank: number
  rankDelta: number
  projectedTotalTips: number
  overtakes: string[]
} {
  const currentBoard = getTipLeaderboard(players)
  const currentRank = currentBoard.findIndex((p) => p.id === playerId) + 1
  const currentPlayer = players.find((p) => p.id === playerId)
  const projectedTotalTips = (currentPlayer?.monthlyTips ?? 0) + extraTip

  const simulated = players
    .map((p) => ({
      id: p.id,
      name: p.name,
      tips: p.id === playerId ? projectedTotalTips : p.monthlyTips,
    }))
    .sort((a, b) => b.tips - a.tips || a.name.localeCompare(b.name))

  const projectedRank = simulated.findIndex((p) => p.id === playerId) + 1
  const overtakes = currentBoard
    .slice(Math.max(0, projectedRank - 1), Math.max(0, currentRank - 1))
    .map((p) => p.name)

  return {
    currentRank,
    projectedRank,
    rankDelta: Math.max(0, currentRank - projectedRank),
    projectedTotalTips,
    overtakes,
  }
}
