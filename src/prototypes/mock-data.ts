import { formatRupiah } from "@/domain/money"

export type ProtoRole = "guest" | "player" | "admin"
export type ProtoScreen = "home" | "pay" | "bill" | "admin"

export interface ProtoPlayer {
  id: string
  name: string
  handle: string
  avatar: string
  avatarUrl?: string | null
  avatarBanned?: boolean
  guildTitle: string
  level: number
  monthlySpend: number
  monthlyTips: number
  ordersCount: number
  savedDiscount: number
  savedPct: number
  badge: "Top spender" | "Big heart" | "Discount hunter" | "Loyal" | "Biggest strike" | null
  bestTipNote: string
  linkedEmail: string | null
  unpaidBills: Array<{
    billId: string
    merchant: string
    date: string
    itemsSummary: string
    amount: number
  }>
  pendingClaim: {
    claimedAmount: number
    submittedAt: string
  } | null
}

export interface ProtoBill {
  id: string
  publicId: string
  merchant: string
  orderDate: string
  finalTotal: number
  sourceSubtotal: number
  voucherDiscount: number
  flatFees: number
  paidCount: number
  totalPlayers: number
  splits: Array<{
    playerId: string
    name: string
    items: Array<{ name: string; qty: number; price: number }>
    itemSubtotal: number
    discountShare: number
    feeShare: number
    totalOwed: number
    status: "paid" | "unpaid"
    paidAmount: number | null
  }>
}

export const TRANSFER_DESTINATION = {
  bankName: "BCA",
  accountNumber: "5480-912-388",
  accountHolder: "Pajar (Admin)",
  ewallet: "GoPay / QRIS · 0812-8800-4412",
} as const

export const INITIAL_PLAYERS: ProtoPlayer[] = [
  {
    id: "p-sinta",
    name: "Sinta",
    handle: "@sinta",
    avatar: "SK",
    guildTitle: "Sultan Tip Jar",
    level: 14,
    monthlySpend: 486500,
    monthlyTips: 38500,
    ordersCount: 11,
    savedDiscount: 196100,
    savedPct: 40.3,
    badge: "Big heart",
    bestTipNote: "Rounded Kopi Tuku Rp36.400 to Rp50.000",
    linkedEmail: "sinta@example.com",
    unpaidBills: [],
    pendingClaim: null,
  },
  {
    id: "p-raka",
    name: "Raka",
    handle: "@raka",
    avatar: "RK",
    guildTitle: "Feast Captain",
    level: 12,
    monthlySpend: 542000,
    monthlyTips: 29200,
    ordersCount: 13,
    savedDiscount: 239675,
    savedPct: 44.2,
    badge: "Top spender",
    bestTipNote: "Wave-off Rp9.800 change on Bakmi GM",
    linkedEmail: "raka@example.com",
    unpaidBills: [
      {
        billId: "b-geprek",
        merchant: "Ayam Geprek Bensu",
        date: "Today",
        itemsSummary: "Paket Geprek Mozza + Es Teh",
        amount: 34600,
      },
    ],
    pendingClaim: null,
  },
  {
    id: "p-dewi",
    name: "Dewi",
    handle: "@dewi",
    avatar: "DW",
    guildTitle: "Matcha Patron",
    level: 11,
    monthlySpend: 419000,
    monthlyTips: 24000,
    ordersCount: 9,
    savedDiscount: 142525,
    savedPct: 34.0,
    badge: "Biggest strike",
    bestTipNote: "Clean Rp100k transfer on Friday coffee",
    linkedEmail: "dewi@example.com",
    unpaidBills: [],
    pendingClaim: null,
  },
  {
    id: "p-bima",
    name: "Bima",
    handle: "@bima",
    avatar: "BM",
    guildTitle: "Lunch Raider",
    level: 9,
    monthlySpend: 394200,
    monthlyTips: 16400,
    ordersCount: 8,
    savedDiscount: 130275,
    savedPct: 33.1,
    badge: "Discount hunter",
    bestTipNote: "Rounded Fore Coffee Rp43.500 to Rp50.000",
    linkedEmail: "bima@example.com",
    unpaidBills: [
      {
        billId: "b-tuku",
        merchant: "Kopi Tuku Kemang",
        date: "Nov 21",
        itemsSummary: "Es Kopi Susu Tetangga + Donut",
        amount: 31800,
      },
      {
        billId: "b-bakmi",
        merchant: "Bakmi GM Express",
        date: "Nov 22",
        itemsSummary: "Bakmi Special GM + Pangsit",
        amount: 38200,
      },
      {
        billId: "b-geprek",
        merchant: "Ayam Geprek Bensu",
        date: "Today",
        itemsSummary: "Paket Geprek Level 5",
        amount: 22400,
      },
    ],
    pendingClaim: {
      claimedAmount: 100000,
      submittedAt: "12m ago",
    },
  },
  {
    id: "p-nadya",
    name: "Nadya",
    handle: "@nadya",
    avatar: "ND",
    guildTitle: "Snack Scout",
    level: 7,
    monthlySpend: 278000,
    monthlyTips: 11800,
    ordersCount: 6,
    savedDiscount: 98400,
    savedPct: 35.4,
    badge: "Loyal",
    bestTipNote: "Added +Rp4.800 on Martabak boss run",
    linkedEmail: "nadya@example.com",
    unpaidBills: [
      {
        billId: "b-tuku",
        merchant: "Kopi Tuku Kemang",
        date: "Nov 21",
        itemsSummary: "Aren Latte + Earl Grey Toast",
        amount: 46200,
      },
    ],
    pendingClaim: {
      claimedAmount: 50000,
      submittedAt: "28m ago",
    },
  },
  {
    id: "p-farhan",
    name: "Farhan",
    handle: "@farhan",
    avatar: "FH",
    guildTitle: "Late Joiner",
    level: 5,
    monthlySpend: 184000,
    monthlyTips: 5200,
    ordersCount: 4,
    savedDiscount: 54200,
    savedPct: 29.5,
    badge: null,
    bestTipNote: "First round-up on Ayam Geprek",
    linkedEmail: null,
    unpaidBills: [
      {
        billId: "b-bakmi",
        merchant: "Bakmi GM Express",
        date: "Nov 22",
        itemsSummary: "Nasi Goreng Smoked Chicken",
        amount: 41700,
      },
      {
        billId: "b-geprek",
        merchant: "Ayam Geprek Bensu",
        date: "Today",
        itemsSummary: "Geprek Sambal Matah",
        amount: 26800,
      },
    ],
    pendingClaim: null,
  },
]

export const FEATURED_BILLS: ProtoBill[] = [
  {
    id: "b-tuku",
    publicId: "tuku-nov21",
    merchant: "Kopi Tuku Kemang",
    orderDate: "2026-11-21",
    sourceSubtotal: 230000,
    voucherDiscount: -103500,
    flatFees: 4500,
    finalTotal: 131000,
    paidCount: 2,
    totalPlayers: 4,
    splits: [
      {
        playerId: "p-sinta",
        name: "Sinta",
        items: [
          { name: "Es Kopi Susu Tetangga", qty: 1, price: 24000 },
          { name: "Butter Croissant", qty: 1, price: 25000 },
        ],
        itemSubtotal: 49000,
        discountShare: -22050,
        feeShare: 1125,
        totalOwed: 28075,
        status: "paid",
        paidAmount: 35000,
      },
      {
        playerId: "p-dewi",
        name: "Dewi",
        items: [{ name: "Matcha Oat Latte", qty: 1, price: 32000 }],
        itemSubtotal: 32000,
        discountShare: -14400,
        feeShare: 1125,
        totalOwed: 24925,
        status: "paid",
        paidAmount: 30000,
      },
      {
        playerId: "p-bima",
        name: "Bima",
        items: [
          { name: "Es Kopi Susu Tetangga", qty: 1, price: 24000 },
          { name: "Donut Kampung", qty: 2, price: 16000 },
        ],
        itemSubtotal: 56000,
        discountShare: -25325,
        feeShare: 1125,
        totalOwed: 31800,
        status: "unpaid",
        paidAmount: null,
      },
      {
        playerId: "p-nadya",
        name: "Nadya",
        items: [
          { name: "Aren Latte", qty: 2, price: 29000 },
          { name: "Earl Grey Toast", qty: 1, price: 35000 },
        ],
        itemSubtotal: 93000,
        discountShare: -47925,
        feeShare: 1125,
        totalOwed: 46200,
        status: "unpaid",
        paidAmount: null,
      },
    ],
  },
  {
    id: "b-bakmi",
    publicId: "bakmi-nov22",
    merchant: "Bakmi GM Express",
    orderDate: "2026-11-22",
    sourceSubtotal: 215000,
    voucherDiscount: -55000,
    flatFees: 6000,
    finalTotal: 166000,
    paidCount: 2,
    totalPlayers: 4,
    splits: [
      {
        playerId: "p-raka",
        name: "Raka",
        items: [{ name: "Bakmi Special GM Jumbo", qty: 1, price: 54000 }],
        itemSubtotal: 54000,
        discountShare: -13800,
        feeShare: 1500,
        totalOwed: 41700,
        status: "paid",
        paidAmount: 50000,
      },
      {
        playerId: "p-sinta",
        name: "Sinta",
        items: [{ name: "Pangsit Goreng 10pc", qty: 1, price: 58000 }],
        itemSubtotal: 58000,
        discountShare: -15100,
        feeShare: 1500,
        totalOwed: 44400,
        status: "paid",
        paidAmount: 50000,
      },
      {
        playerId: "p-bima",
        name: "Bima",
        items: [{ name: "Bakmi Special GM + Pangsit", qty: 1, price: 49000 }],
        itemSubtotal: 49000,
        discountShare: -12300,
        feeShare: 1500,
        totalOwed: 38200,
        status: "unpaid",
        paidAmount: null,
      },
      {
        playerId: "p-farhan",
        name: "Farhan",
        items: [{ name: "Nasi Goreng Smoked Chicken", qty: 1, price: 54000 }],
        itemSubtotal: 54000,
        discountShare: -13800,
        feeShare: 1500,
        totalOwed: 41700,
        status: "unpaid",
        paidAmount: null,
      },
    ],
  },
  {
    id: "b-geprek",
    publicId: "geprek-nov23",
    merchant: "Ayam Geprek Bensu",
    orderDate: "2026-11-23",
    sourceSubtotal: 156000,
    voucherDiscount: -44000,
    flatFees: 5500,
    finalTotal: 117500,
    paidCount: 1,
    totalPlayers: 4,
    splits: [
      {
        playerId: "p-dewi",
        name: "Dewi",
        items: [{ name: "Paket Geprek Keju", qty: 1, price: 44000 }],
        itemSubtotal: 44000,
        discountShare: -11675,
        feeShare: 1375,
        totalOwed: 33700,
        status: "paid",
        paidAmount: 35000,
      },
      {
        playerId: "p-raka",
        name: "Raka",
        items: [{ name: "Paket Geprek Mozza + Es Teh", qty: 1, price: 46000 }],
        itemSubtotal: 46000,
        discountShare: -12775,
        feeShare: 1375,
        totalOwed: 34600,
        status: "unpaid",
        paidAmount: null,
      },
      {
        playerId: "p-bima",
        name: "Bima",
        items: [{ name: "Paket Geprek Level 5", qty: 1, price: 30000 }],
        itemSubtotal: 30000,
        discountShare: -8975,
        feeShare: 1375,
        totalOwed: 22400,
        status: "unpaid",
        paidAmount: null,
      },
      {
        playerId: "p-farhan",
        name: "Farhan",
        items: [{ name: "Geprek Sambal Matah", qty: 1, price: 36000 }],
        itemSubtotal: 36000,
        discountShare: -10575,
        feeShare: 1375,
        totalOwed: 26800,
        status: "unpaid",
        paidAmount: null,
      },
    ],
  },
  {
    id: "b-fore",
    publicId: "fore-nov18",
    merchant: "Fore Coffee Senopati",
    orderDate: "2026-11-18",
    sourceSubtotal: 162000,
    voucherDiscount: -48000,
    flatFees: 4000,
    finalTotal: 118000,
    paidCount: 3,
    totalPlayers: 3,
    splits: [
      {
        playerId: "p-sinta",
        name: "Sinta",
        items: [{ name: "Butterscotch Sea Salt Latte", qty: 1, price: 54000 }],
        itemSubtotal: 54000,
        discountShare: -16000,
        feeShare: 1334,
        totalOwed: 39334,
        status: "paid",
        paidAmount: 45000,
      },
      {
        playerId: "p-raka",
        name: "Raka",
        items: [{ name: "Iced Aren Latte Large", qty: 1, price: 54000 }],
        itemSubtotal: 54000,
        discountShare: -16000,
        feeShare: 1333,
        totalOwed: 39333,
        status: "paid",
        paidAmount: 45000,
      },
      {
        playerId: "p-bima",
        name: "Bima",
        items: [{ name: "Pandan Latte + Croffle", qty: 1, price: 54000 }],
        itemSubtotal: 54000,
        discountShare: -16000,
        feeShare: 1333,
        totalOwed: 39333,
        status: "paid",
        paidAmount: 45000,
      },
    ],
  },
  {
    id: "b-martabak",
    publicId: "martabak-nov15",
    merchant: "Martabak Pecenongan 78",
    orderDate: "2026-11-15",
    sourceSubtotal: 190000,
    voucherDiscount: -40000,
    flatFees: 6000,
    finalTotal: 156000,
    paidCount: 4,
    totalPlayers: 4,
    splits: [
      {
        playerId: "p-dewi",
        name: "Dewi",
        items: [{ name: "Martabak Coklat Keju (1/4)", qty: 1, price: 48000 }],
        itemSubtotal: 48000,
        discountShare: -10105,
        feeShare: 1500,
        totalOwed: 39395,
        status: "paid",
        paidAmount: 45000,
      },
      {
        playerId: "p-nadya",
        name: "Nadya",
        items: [{ name: "Martabak Coklat Keju (1/4)", qty: 1, price: 48000 }],
        itemSubtotal: 48000,
        discountShare: -10105,
        feeShare: 1500,
        totalOwed: 39395,
        status: "paid",
        paidAmount: 45000,
      },
      {
        playerId: "p-raka",
        name: "Raka",
        items: [{ name: "Martabak Telor Special (1/2)", qty: 1, price: 47000 }],
        itemSubtotal: 47000,
        discountShare: -9895,
        feeShare: 1500,
        totalOwed: 38605,
        status: "paid",
        paidAmount: 40000,
      },
      {
        playerId: "p-sinta",
        name: "Sinta",
        items: [{ name: "Martabak Telor Special (1/2)", qty: 1, price: 47000 }],
        itemSubtotal: 47000,
        discountShare: -9895,
        feeShare: 1500,
        totalOwed: 38605,
        status: "paid",
        paidAmount: 50000,
      },
    ],
  },
]

export function getBillRemainingAmount(bill: ProtoBill): number {
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

export function gapToNextSpend(
  playerId: string,
  spendBoard: ProtoPlayer[]
): { targetRank: number; amount: number } | null {
  const idx = spendBoard.findIndex((p) => p.id === playerId)
  if (idx <= 0) return null
  const above = spendBoard[idx - 1]
  const curr = spendBoard[idx]
  return {
    targetRank: idx,
    amount: Math.max(0, above.monthlySpend - curr.monthlySpend),
  }
}

export const NOVEMBER_WEEKS = [
  { id: "w1", label: "Week 1", range: "Nov 1-7", startDay: 1, endDay: 7 },
  { id: "w2", label: "Week 2", range: "Nov 8-14", startDay: 8, endDay: 14 },
  { id: "w3", label: "Week 3", range: "Nov 15-21", startDay: 15, endDay: 21 },
  { id: "w4", label: "Week 4", range: "Nov 22-28", startDay: 22, endDay: 28 },
  { id: "w5", label: "Week 5", range: "Nov 29-30", startDay: 29, endDay: 30 },
] as const

export function getBillDayOfMonth(orderDate: string): number {
  const parts = orderDate.split("-")
  return Number(parts[2] ?? 1)
}

export function getTipTargets(
  players: ProtoPlayer[],
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

export function getPlayerUnpaidTotal(player: ProtoPlayer): number {
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
  const cleanBig =
    owed < 50000
      ? 50000
      : owed < 100000
        ? 100000
        : Math.ceil((owed + 10000) / 50000) * 50000

  const raw = [
    { label: "Exact", amount: owed },
    { label: "Round 500", amount: round500 === owed ? owed + 500 : round500 },
    { label: "Round 1k", amount: round1k === owed ? owed + 1000 : round1k },
    { label: "Round 5k", amount: round5k === owed ? owed + 5000 : round5k },
    { label: `Clean ${formatRupiah(cleanBig)}`, amount: cleanBig },
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

export function getTipLeaderboard(players: ProtoPlayer[]): ProtoPlayer[] {
  return [...players].sort((a, b) => b.monthlyTips - a.monthlyTips)
}

export function getSpendingLeaderboard(players: ProtoPlayer[]): ProtoPlayer[] {
  return [...players].sort((a, b) => b.monthlySpend - a.monthlySpend)
}

export function projectTipRank(
  players: ProtoPlayer[],
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
    .sort((a, b) => b.tips - a.tips)

  const projectedRank = simulated.findIndex((p) => p.id === playerId) + 1
  const overtakes = currentBoard
    .slice(projectedRank - 1, currentRank - 1)
    .map((p) => p.name)

  return {
    currentRank,
    projectedRank,
    rankDelta: Math.max(0, currentRank - projectedRank),
    projectedTotalTips,
    overtakes,
  }
}
