import {
  ArrowDown,
  Camera,
  CaretDown,
  Check,
  Clock,
  Crown,
  Heart,
  LockSimple,
  LockSimpleOpen,
  PencilSimple,
  Prohibit,
  ShieldCheck,
  Trash,
  Trophy,
  Users,
  Warning,
  X,
} from "@phosphor-icons/react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"

import { AvatarUploadDialog } from "@/components/telemetry/AvatarUploadDialog"
import {
  CurrentMonthBadgeCue,
  PlayerHoverCard,
} from "@/components/telemetry/PlayerHoverCard"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  EarnedBadgePill,
  PageLoading,
  PayAllCard,
  PlayerAvatar,
  TierPill,
  fmtDate,
  prepareHeroPlayerTransition,
} from "@/components/telemetry/components"
import { formatRupiah } from "@/domain/money"
import {
  gapToNextSpend,
  getPlayerUnpaidTotal,
  getSpendingLeaderboard,
  tierForSpend,
} from "@/domain/types"
import type { PlayerDetailResponse } from "@/domain/types"
import { useAppStore } from "@/lib/app-store"

export const Route = createFileRoute("/players/$playerId")({
  component: PlayerDetailRoute,
})

const MERCHANT_COLORS = [
  "var(--rt-accent)",
  "var(--rt-ink)",
  "var(--rt-muted)",
  "var(--rt-ui-border)",
  "var(--rt-border)",
]

function fmtCompactRp(amount: number): string {
  if (amount >= 1_000_000) {
    return `Rp${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  }
  if (amount >= 100_000) {
    return `Rp${Math.round(amount / 1_000)}k`
  }
  if (amount >= 1_000) {
    return `Rp${(amount / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  }
  return `Rp${amount}`
}

function PlayerDetailRoute() {
  const { playerId } = Route.useParams()
  const {
    players,
    me,
    role,
    handleSignIn,
    handleNotify,
    setPreview,
    uploadMyAvatar,
    removeMyAvatar,
    updateMyUsername,
    updatePlayer,
    removePlayerAvatarAdmin,
    setPlayerAvatarBanned,
    setPlayerNameLocked,
  } = useAppStore()
  const [detail, setDetail] = useState<PlayerDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null)
  const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null)
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const [adminActionBusy, setAdminActionBusy] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)
  const [draftUsername, setDraftUsername] = useState("")
  const [savingUsername, setSavingUsername] = useState(false)

  const loadDetail = async () => {
    try {
      const res = await fetch(
        `/api/public/players/${encodeURIComponent(playerId)}`
      )
      if (res.status === 404) {
        setNotFound(true)
        setDetail(null)
        return
      }
      if (!res.ok) return
      const data = (await res.json()) as PlayerDetailResponse
      setDetail(data)
      setNotFound(false)
    } finally {
      setLoading(false)
    }
  }

  const [showAllMerchants, setShowAllMerchants] = useState(false)
  const [showAllOrders, setShowAllOrders] = useState(false)

  useEffect(() => {
    setShowAllMerchants(false)
    setShowAllOrders(false)
    setLoading(true)
    void loadDetail()
  }, [playerId, players])

  const orderHistory = detail?.orderHistory ?? []

  const biggestOrder = useMemo(() => {
    if (orderHistory.length === 0) return null
    return orderHistory.reduce((best, curr) =>
      curr.split.totalOwed > best.split.totalOwed ? curr : best
    )
  }, [orderHistory])

  const merchantSplit = detail?.merchantSplit ?? []
  const totalMerchantSpend = merchantSplit.reduce((s, m) => s + m.spend, 0)

  const frequentSpots = useMemo(() => {
    return [...merchantSplit]
      .sort((a, b) => b.orders - a.orders || b.spend - a.spend)
      .slice(0, 5)
  }, [merchantSplit])

  const maxFreqOrders = Math.max(...frequentSpots.map((i) => i.orders), 1)
  const hasRepeatSpot = frequentSpots.some((i) => i.orders > 1)

  const weekdayRhythm = detail?.weekdayRhythm ?? []
  const maxWeekdaySpend = Math.max(...weekdayRhythm.map((d) => d.spend), 1)
  const totalWeekdaySpend = weekdayRhythm.reduce((s, d) => s + d.spend, 0)
  const peakWeekday = useMemo(() => {
    const withOrders = weekdayRhythm.filter((d) => d.orders > 0)
    if (withOrders.length === 0) return null
    return withOrders.reduce((best, curr) =>
      curr.spend > best.spend ? curr : best
    )
  }, [weekdayRhythm])

  const activeWeekday =
    weekdayRhythm.find((d) => d.idx === selectedWeekday) ?? peakWeekday

  const costBreakdown = detail?.costBreakdown ?? {
    menuValue: 0,
    saved: 0,
    fees: 0,
    netBills: 0,
    tips: 0,
    outOfPocket: 0,
    savedRate: 0,
  }
  const companions = detail?.companions ?? []
  const monthlySeries = detail?.monthlySeries ?? []
  const monthlyBadges = detail?.monthlyBadges ?? []

  const maxMonthlyMenu = Math.max(
    ...monthlySeries.map((m) => m.spend + m.tips + m.saved),
    1
  )
  const avgMonthlyOut =
    monthlySeries.length > 0
      ? Math.round(
          monthlySeries.reduce((s, m) => s + m.spend + m.tips, 0) /
            monthlySeries.length
        )
      : 0
  const lastIdx = monthlySeries.length - 1
  const prevMonth = lastIdx >= 1 ? monthlySeries[lastIdx - 1] : null
  const currMonth = lastIdx >= 0 ? monthlySeries[lastIdx] : null
  const prevMonthOut = prevMonth ? prevMonth.spend + prevMonth.tips : 0
  const currMonthOut = currMonth ? currMonth.spend + currMonth.tips : 0
  const momDeltaPct =
    prevMonthOut > 0
      ? Math.round(((currMonthOut - prevMonthOut) / prevMonthOut) * 100)
      : 0
  const activeMonth =
    monthlySeries.find((m) => m.key === hoveredMonth) ?? currMonth ?? null

  if (loading && !detail) {
    return <PageLoading label="Loading dossier..." />
  }

  if (notFound || !detail) {
    return (
      <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-10 text-center">
        <h1 className="rt2-display text-4xl font-extrabold">
          Player not found
        </h1>
        <Link
          to="/ranks"
          className="rt2-focus rt2-btn-primary mt-5 inline-flex min-h-[44px] items-center rounded px-5 text-[15px] font-bold"
        >
          Back to Ranks
        </Link>
      </section>
    )
  }

  const player = detail.player
  const spendBoard = getSpendingLeaderboard(players)
  const spendRank = detail.spendRank
  const tipRank = detail.tipRank
  const tier = tierForSpend(player.monthlySpend, detail.topSpend)
  const gap = gapToNextSpend(player.id, spendBoard)
  const jarShare =
    detail.totalTipPot > 0
      ? ((player.monthlyTips / detail.totalTipPot) * 100).toFixed(1)
      : "0.0"
  const owed = getPlayerUnpaidTotal(player)
  const avgPerOrder =
    player.ordersCount > 0
      ? Math.round(player.monthlySpend / player.ordersCount)
      : 0

  const isLinkedSelf = me.authenticated && me.linkedPlayerId === player.id
  const canEditAvatar = isLinkedSelf && !player.avatarBanned
  const canEditUsername =
    role === "admin" || (isLinkedSelf && !player.nameLocked)

  const handleStartEditUsername = () => {
    setDraftUsername(player.name)
    setEditingUsername(true)
  }

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = draftUsername.trim()
    if (!trimmed || savingUsername) return
    setSavingUsername(true)
    try {
      const ok =
        role === "admin" && !isLinkedSelf
          ? await updatePlayer(player.id, { name: trimmed })
          : role === "admin" && player.nameLocked
            ? await updatePlayer(player.id, { name: trimmed })
            : await updateMyUsername(trimmed)
      if (ok) {
        setEditingUsername(false)
        await loadDetail()
      }
    } finally {
      setSavingUsername(false)
    }
  }

  const scrollToUnpaidBills = () => {
    const target =
      document.getElementById("first-unpaid-bill") ??
      document.getElementById("order-history")
    target?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  const scrollToMonthlyBadges = () => {
    document
      .getElementById("monthly-badges")
      ?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  const latestMonthlyBadge = monthlyBadges[0] ?? null

  return (
    <div className="space-y-6">
      <div>
        <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <PlayerAvatar player={player} size="xl" chamfer heroStyle />
                {canEditAvatar && (
                  <button
                    type="button"
                    aria-label="Change avatar"
                    title="Change avatar"
                    onClick={() => setAvatarDialogOpen(true)}
                    className="rt2-focus rt2-btn-primary absolute -right-2 -bottom-2 flex h-8 w-8 items-center justify-center rounded-full shadow"
                  >
                    <Camera size={14} weight="bold" />
                  </button>
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {editingUsername ? (
                    <form
                      onSubmit={(e) => void handleSaveUsername(e)}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        type="text"
                        value={draftUsername}
                        maxLength={40}
                        aria-label="Custom name"
                        autoFocus
                        onChange={(e) => setDraftUsername(e.target.value)}
                        className="rt2-focus h-10 w-52 rounded border-2 border-[var(--rt-accent)] bg-[var(--rt-surface-alt)] px-3 text-[16px] font-bold"
                      />
                      <button
                        type="submit"
                        disabled={savingUsername || !draftUsername.trim()}
                        className="rt2-focus rt2-btn-primary inline-flex h-10 items-center gap-1 rounded px-3 text-[13px] font-bold disabled:opacity-50"
                      >
                        <Check size={14} weight="bold" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingUsername(false)}
                        className="rt2-focus rt2-btn-secondary inline-flex h-10 items-center gap-1 rounded px-3 text-[13px] font-bold"
                      >
                        <X size={14} weight="bold" />
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <h1
                      style={{ viewTransitionName: "hero-player-name" }}
                      className="rt2-display text-4xl font-extrabold"
                    >
                      {player.name}
                    </h1>
                  )}
                </div>
                <p className="tnum mt-1 font-arcade-mono text-[13px] text-[var(--rt-muted)]">
                  {player.ordersCount} bills · Avg {formatRupiah(avgPerOrder)}{" "}
                  / bill · Saved {formatRupiah(player.savedDiscount)} (
                  {player.savedPct}%)
                </p>

                {/* Avatar & name controls + moderation notices */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {canEditAvatar && (
                    <button
                      type="button"
                      onClick={() => setAvatarDialogOpen(true)}
                      className="rt2-focus rt2-btn-secondary inline-flex min-h-[32px] items-center gap-1.5 rounded px-2.5 text-[12px] font-bold"
                    >
                      <Camera size={13} weight="bold" />
                      {player.avatarUrl ? "Change avatar" : "Upload avatar"}
                    </button>
                  )}
                  {canEditUsername && !editingUsername && isLinkedSelf && (
                    <button
                      type="button"
                      onClick={handleStartEditUsername}
                      className="rt2-focus rt2-btn-secondary inline-flex min-h-[32px] items-center gap-1.5 rounded px-2.5 text-[12px] font-bold"
                    >
                      <PencilSimple size={13} weight="bold" />
                      Change name
                    </button>
                  )}
                  {role === "admin" && (
                    <Popover
                      open={adminMenuOpen}
                      onOpenChange={setAdminMenuOpen}
                    >
                      <PopoverTrigger
                        disabled={adminActionBusy}
                        className="rt2-focus rt2-btn-secondary inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded px-2.5 text-[12px] font-bold"
                      >
                        <ShieldCheck size={14} weight="bold" />
                        {adminActionBusy ? "Updating..." : "Admin actions"}
                        <CaretDown size={12} weight="bold" />
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-48 p-1.5">
                        {canEditUsername && !editingUsername && !isLinkedSelf && (
                          <button
                            type="button"
                            onClick={() => {
                              setAdminMenuOpen(false)
                              handleStartEditUsername()
                            }}
                            className="rt2-focus flex min-h-[38px] w-full cursor-pointer items-center gap-2 rounded px-2.5 text-left text-[13px] font-bold hover:bg-white/10"
                          >
                            <PencilSimple size={15} weight="bold" />
                            Force name
                          </button>
                        )}
                        {player.avatarUrl && (
                          <button
                            type="button"
                            onClick={async () => {
                              setAdminMenuOpen(false)
                              setAdminActionBusy(true)
                              const ok = await removePlayerAvatarAdmin(
                                player.id
                              )
                              if (ok) await loadDetail()
                              setAdminActionBusy(false)
                            }}
                            className="rt2-focus flex min-h-[38px] w-full cursor-pointer items-center gap-2 rounded px-2.5 text-left text-[13px] font-bold text-[var(--rt-accent-ink)] hover:bg-white/10"
                          >
                            <Trash size={15} weight="bold" />
                            Remove avatar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            setAdminMenuOpen(false)
                            setAdminActionBusy(true)
                            const ok = await setPlayerAvatarBanned(
                              player.id,
                              !player.avatarBanned
                            )
                            if (ok) await loadDetail()
                            setAdminActionBusy(false)
                          }}
                          className="rt2-focus flex min-h-[38px] w-full cursor-pointer items-center gap-2 rounded px-2.5 text-left text-[13px] font-bold hover:bg-white/10"
                        >
                          <Prohibit size={15} weight="bold" />
                          {player.avatarBanned ? "Unban avatar" : "Ban avatar"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setAdminMenuOpen(false)
                            setAdminActionBusy(true)
                            const ok = await setPlayerNameLocked(
                              player.id,
                              !player.nameLocked
                            )
                            if (ok) await loadDetail()
                            setAdminActionBusy(false)
                          }}
                          className="rt2-focus flex min-h-[38px] w-full cursor-pointer items-center gap-2 rounded px-2.5 text-left text-[13px] font-bold hover:bg-white/10"
                        >
                          {player.nameLocked ? (
                            <>
                              <LockSimpleOpen size={15} weight="bold" />
                              Unlock name
                            </>
                          ) : (
                            <>
                              <LockSimple size={15} weight="bold" />
                              Lock name
                            </>
                          )}
                        </button>
                      </PopoverContent>
                    </Popover>
                  )}
                  {player.avatarBanned && (
                    <span className="inline-flex items-center gap-1 rounded bg-[var(--rt-accent-soft)] px-2 py-0.5 font-arcade-mono text-[12px] font-bold text-[var(--rt-accent-ink)]">
                      <Prohibit size={13} weight="bold" />
                      Avatar uploads disabled by admin
                    </span>
                  )}
                  {player.nameLocked && (
                    <span className="inline-flex items-center gap-1 rounded bg-[var(--rt-amber-soft)] px-2 py-0.5 font-arcade-mono text-[12px] font-bold text-[var(--rt-amber-ink)]">
                      <LockSimple size={13} weight="bold" />
                      Name locked by admin
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TierPill tier={tier} />
              {player.badge && <EarnedBadgePill badge={player.badge} />}
              {latestMonthlyBadge && (
                <button
                  type="button"
                  onClick={scrollToMonthlyBadges}
                  aria-label="Jump to monthly badges history"
                  className="rt2-focus rt2-btn-secondary inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 font-arcade-mono text-[12px] font-bold"
                >
                  {latestMonthlyBadge.stickerSrc ? (
                    <img
                      src={latestMonthlyBadge.stickerSrc}
                      alt=""
                      width={22}
                      height={22}
                      className="h-5.5 w-5.5 shrink-0 object-contain"
                    />
                  ) : latestMonthlyBadge.kind === "spending" ? (
                    <Crown
                      size={14}
                      weight="fill"
                      className="shrink-0 text-[var(--rt-amber-ink)]"
                    />
                  ) : (
                    <Heart
                      size={14}
                      weight="fill"
                      className="shrink-0 text-[var(--rt-teal-ink)]"
                    />
                  )}
                  <span className="tnum">
                    {monthlyBadges.length}{" "}
                    {monthlyBadges.length === 1 ? "badge" : "badges"}
                  </span>
                  <ArrowDown size={12} weight="bold" className="shrink-0" />
                </button>
              )}
              <span className="rounded border border-[var(--rt-ui-border)] bg-[var(--rt-bg)] px-2.5 py-1 font-arcade-mono text-[13px] font-bold">
                Spender #{spendRank} | Tipper #{tipRank}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* KPI Cards (5 cards including Biggest Bill) */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4">
          <p className="text-[14px] font-bold text-[var(--rt-muted)]">
            Total spend
          </p>
          <p className="tnum mt-1 font-arcade-mono text-2xl font-bold">
            {formatRupiah(player.monthlySpend)}
          </p>
          <p className="mt-1 text-[13px] text-[var(--rt-muted)]">
            {player.ordersCount} bills this month
          </p>
        </div>

        <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4">
          <p className="text-[14px] font-bold text-[var(--rt-muted)]">
            Monthly tips
          </p>
          <p className="tnum mt-1 font-arcade-mono text-2xl font-bold text-[var(--rt-teal-ink)]">
            +{formatRupiah(player.monthlyTips)}
          </p>
          <p className="mt-1 text-[13px] text-[var(--rt-muted)]">
            {jarShare}% of the tip jar
          </p>
        </div>

        <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4">
          <p className="text-[14px] font-bold text-[var(--rt-muted)]">
            Discount saved
          </p>
          <p className="tnum mt-1 font-arcade-mono text-2xl font-bold text-[var(--rt-teal-ink)]">
            {formatRupiah(player.savedDiscount)}
          </p>
          <p className="mt-1 text-[13px] text-[var(--rt-muted)]">
            {player.savedPct}% saved{" "}
            {gap
              ? `| ${formatRupiah(gap.amount)} to #${gap.targetRank}`
              : "| #1 spender"}
          </p>
        </div>

        {biggestOrder ? (
          <Link
            to="/b/$publicId"
            params={{ publicId: biggestOrder.bill.publicId }}
            className="rt2-focus rt2-row-hover rounded border-2 border-[var(--rt-amber)] bg-[var(--rt-surface)] p-4 text-left"
          >
            <p className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--rt-amber-ink)]">
              <Trophy size={15} weight="fill" />
              Biggest bill
            </p>
            <p className="tnum mt-1 font-arcade-mono text-2xl font-bold text-[var(--rt-amber-ink)]">
              {formatRupiah(biggestOrder.split.totalOwed)}
            </p>
            <p className="mt-1 truncate text-[13px] text-[var(--rt-muted)]">
              {biggestOrder.bill.merchant} ·{" "}
              {fmtDate(biggestOrder.bill.orderDate)}
            </p>
          </Link>
        ) : (
          <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4">
            <p className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--rt-muted)]">
              <Trophy size={15} weight="fill" />
              Biggest bill
            </p>
            <p className="tnum mt-1 font-arcade-mono text-2xl font-bold text-[var(--rt-muted)]">
              Rp0
            </p>
            <p className="mt-1 text-[13px] text-[var(--rt-muted)]">
              No orders yet
            </p>
          </div>
        )}

        {player.unpaidBills.length > 0 ? (
          <button
            type="button"
            onClick={scrollToUnpaidBills}
            className="rt2-focus rt2-row-hover rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4 text-left"
          >
            <p className="text-[14px] font-bold text-[var(--rt-muted)]">
              Open balance
            </p>
            <p className="tnum mt-1 font-arcade-mono text-2xl font-bold text-[var(--rt-accent-ink)]">
              {formatRupiah(owed)}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--rt-accent-ink)]">
              {player.unpaidBills.length}{" "}
              {player.unpaidBills.length === 1 ? "unpaid bill" : "unpaid bills"}
              <ArrowDown size={13} weight="bold" />
            </p>
          </button>
        ) : (
          <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4">
            <p className="text-[14px] font-bold text-[var(--rt-muted)]">
              Open balance
            </p>
            <p className="tnum mt-1 font-arcade-mono text-2xl font-bold text-[var(--rt-teal-ink)]">
              {formatRupiah(owed)}
            </p>
            <p className="mt-1 text-[13px] text-[var(--rt-muted)]">
              All settled
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          {/* Monthly Badges (v1 sticker badges + trophy cards) */}
          <div
            id="monthly-badges"
            className="scroll-mt-24 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5"
          >
            <div className="flex items-baseline justify-between border-b border-[var(--rt-border-soft)] pb-2.5">
              <h2 className="rt2-display text-2xl font-extrabold">
                Monthly badges
              </h2>
              <span className="font-arcade-mono text-[13px] font-bold text-[var(--rt-muted)]">
                {monthlyBadges.length} earned
              </span>
            </div>

            {monthlyBadges.length === 0 ? (
              <p className="mt-3 text-[14px] text-[var(--rt-muted)]">
                No monthly #1 badges yet. Finish #1 in spending or tips to earn
                a collectible sticker.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-5">
                {monthlyBadges.map((b) => {
                  const title =
                    b.kind === "spending"
                      ? `Most spending · ${b.monthLabel}`
                      : `Most tips · ${b.monthLabel}`
                  const valueText =
                    b.kind === "tips"
                      ? `+${formatRupiah(b.amount)}`
                      : formatRupiah(b.amount)
                  if (b.stickerSrc) {
                    return (
                      <div
                        key={`${b.kind}-${b.monthKey}`}
                        className="group/sticker relative flex flex-col items-center transition-transform duration-150 hover:-translate-y-1"
                      >
                        <img
                          src={b.stickerSrc}
                          alt={`${title}: ${valueText}`}
                          width={120}
                          height={120}
                          className="h-30 w-30 object-contain drop-shadow-sm"
                        />
                        <div
                          role="tooltip"
                          className="pointer-events-none absolute -top-11 left-1/2 z-40 hidden -translate-x-1/2 rounded bg-[var(--rt-tip-bg)] px-2.5 py-1 text-center font-arcade-mono text-[12px] whitespace-nowrap text-[var(--rt-tip-ink)] shadow-lg group-hover/sticker:block"
                        >
                          <p className="font-bold">{title}</p>
                          <p className="tnum text-[var(--rt-tip-muted)]">
                            {valueText}
                          </p>
                        </div>
                      </div>
                    )
                  }
                  const Icon = b.kind === "spending" ? Crown : Heart
                  return (
                    <div
                      key={`${b.kind}-${b.monthKey}`}
                      className="inline-flex items-center gap-3 rounded border-2 border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] px-3.5 py-2.5 text-[var(--rt-teal-ink)]"
                    >
                      <span className="flex h-11 w-10 flex-col items-center justify-center rounded-sm border border-current">
                        <Icon size={18} weight="fill" />
                        <span className="font-arcade-mono text-[10px] font-bold uppercase">
                          {b.monthLabel.slice(0, 3)}
                        </span>
                      </span>
                      <div>
                        <p className="font-arcade-mono text-[12px] font-bold uppercase">
                          {title}
                        </p>
                        <p className="tnum font-arcade-mono text-[15px] font-bold">
                          {valueText}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 1. Monthly Spend & Pace + 2. Order Rhythm (Mon-Sun) */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* Monthly Spend & Pace */}
            <div className="flex min-w-0 flex-col rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="rt2-display text-2xl font-extrabold">
                  Monthly spend
                </h2>
                {prevMonth && (
                  <span
                    className={`tnum rounded border px-2 py-0.5 font-arcade-mono text-[12px] font-bold ${
                      momDeltaPct > 0
                        ? "border-[var(--rt-accent)] bg-[var(--rt-accent-soft)] text-[var(--rt-accent-ink)]"
                        : "border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
                    }`}
                  >
                    {momDeltaPct > 0 ? `+${momDeltaPct}%` : `${momDeltaPct}%`} vs{" "}
                    {prevMonth.label}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-arcade-mono text-[11px] text-[var(--rt-muted)]">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-[var(--rt-accent)]" />
                  Net bill
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-[var(--rt-teal)]" />
                  Tips
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs border border-dashed border-[var(--rt-muted)]" />
                  Menu price
                </span>
              </div>

              <div className="relative mt-4 flex h-44 items-end gap-2 border-b-2 border-[var(--rt-border)] pt-6 pb-2 sm:gap-3">
                {/* 4-month average reference line */}
                <div
                  style={{
                    bottom: `${Math.min(
                      92,
                      Math.max(12, Math.round((avgMonthlyOut / maxMonthlyMenu) * 100))
                    )}%`,
                  }}
                  className="pointer-events-none absolute inset-x-0 z-20 border-t border-dashed border-[var(--rt-muted)]/60"
                >
                  <span className="tnum absolute -top-4.5 right-0 rounded border border-[var(--rt-border-soft)] bg-[var(--rt-surface)]/95 px-1.5 py-0.5 font-arcade-mono text-[10px] font-bold text-[var(--rt-muted)] shadow-xs">
                    Avg {fmtCompactRp(avgMonthlyOut)}
                  </span>
                </div>

                {monthlySeries.map((m) => {
                  const totalMenu = m.spend + m.tips + m.saved
                  const menuPct = Math.max(
                    12,
                    Math.round((totalMenu / maxMonthlyMenu) * 100)
                  )
                  const netPct = Math.max(
                    8,
                    Math.round((m.spend / maxMonthlyMenu) * 100)
                  )
                  const tipPct = Math.round((m.tips / maxMonthlyMenu) * 100)
                  const isCurrent = currMonth?.key === m.key
                  const isActive = activeMonth?.key === m.key

                  return (
                    <button
                      key={m.key}
                      type="button"
                      onMouseEnter={() => setHoveredMonth(m.key)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      onFocus={() => setHoveredMonth(m.key)}
                      onClick={() => setHoveredMonth(m.key)}
                      aria-label={`${m.label}: ${formatRupiah(m.spend + m.tips)} out of pocket across ${m.orders} bills`}
                      className="rt2-focus relative flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end"
                    >
                      <span
                        className={`tnum mb-1 truncate font-arcade-mono text-[10px] font-bold sm:text-[11px] ${
                          isActive
                            ? "text-[var(--rt-ink)]"
                            : "text-[var(--rt-muted)]"
                        }`}
                      >
                        {fmtCompactRp(m.spend + m.tips)}
                      </span>
                      <div className="relative flex h-full w-full max-w-[44px] items-end justify-center">
                        {/* Ghost menu price outline */}
                        <div
                          style={{ height: `${menuPct}%` }}
                          className="pointer-events-none absolute inset-x-0 bottom-0 rounded-t-xs border border-dashed border-[var(--rt-muted)]/45 bg-[var(--rt-bg)]/45"
                        />
                        {/* Stacked Net + Tips bar */}
                        <div className="relative z-10 flex h-full w-full flex-col justify-end overflow-hidden rounded-t-xs">
                          {tipPct > 0 && (
                            <div
                              style={{ height: `${Math.max(3, tipPct)}%` }}
                              className="w-full bg-[var(--rt-teal)]"
                            />
                          )}
                          <div
                            style={{ height: `${netPct}%` }}
                            className={`w-full transition-colors ${
                              isCurrent || isActive
                                ? "bg-[var(--rt-accent)]"
                                : "bg-[var(--rt-ink)]/70"
                            }`}
                          />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="mt-2 flex gap-2 text-center font-arcade-mono text-[11px] sm:gap-3 sm:text-[12px]">
                {monthlySeries.map((m) => (
                  <div key={m.key} className="min-w-0 flex-1">
                    <p
                      className={`font-bold ${
                        activeMonth?.key === m.key
                          ? "text-[var(--rt-ink)]"
                          : "text-[var(--rt-muted)]"
                      }`}
                    >
                      {m.label}
                    </p>
                    <p className="tnum text-[11px] text-[var(--rt-muted)]">
                      {m.orders}x
                    </p>
                  </div>
                ))}
              </div>

              {/* Inline readout (tap/hover friendly on phone & tablet) */}
              {activeMonth && (
                <div className="mt-auto pt-3">
                <div className="flex flex-col gap-0.5 rounded border border-[var(--rt-border-soft)] bg-[var(--rt-surface-alt)] px-3 py-2 font-arcade-mono text-[12px]">
                  <span className="truncate font-bold text-[var(--rt-ink)]">
                    {activeMonth.label} · {activeMonth.orders} bills
                  </span>
                  <span className="tnum truncate text-[var(--rt-muted)]">
                    Net{" "}
                    <strong className="text-[var(--rt-ink)]">
                      {formatRupiah(activeMonth.spend)}
                    </strong>{" "}
                    · Tip{" "}
                    <strong className="text-[var(--rt-teal-ink)]">
                      +{formatRupiah(activeMonth.tips)}
                    </strong>
                  </span>
                </div>
                </div>
              )}
            </div>

            {/* Order Rhythm (Mon-Sun) */}
            <div className="flex flex-col rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="rt2-display text-2xl font-extrabold">
                  Order rhythm
                </h2>
                {peakWeekday && (
                  <span className="tnum rounded border border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-2 py-0.5 font-arcade-mono text-[12px] font-bold text-[var(--rt-ink)]">
                    Peak: {peakWeekday.short} (
                    {totalWeekdaySpend > 0
                      ? Math.round((peakWeekday.spend / totalWeekdaySpend) * 100)
                      : 0}
                    %)
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-[var(--rt-muted)]">
                Spending pattern by day of week (Mon-Sun)
              </p>

              <div className="mt-4 flex h-44 items-end gap-1.5 border-b-2 border-[var(--rt-border)] pt-6 pb-2 sm:gap-2">
                {weekdayRhythm.map((day) => {
                  const pct =
                    day.orders > 0
                      ? Math.max(
                          14,
                          Math.round((day.spend / maxWeekdaySpend) * 100)
                        )
                      : 0
                  const isPeak = peakWeekday?.idx === day.idx
                  const isSelected = activeWeekday?.idx === day.idx

                  return (
                    <button
                      key={day.short}
                      type="button"
                      onMouseEnter={() => setSelectedWeekday(day.idx)}
                      onFocus={() => setSelectedWeekday(day.idx)}
                      onClick={() => setSelectedWeekday(day.idx)}
                      aria-label={`${day.short}: ${day.orders} bills, ${formatRupiah(day.spend)}`}
                      className="rt2-focus flex h-full flex-1 cursor-pointer flex-col items-center justify-end"
                    >
                      {day.orders > 0 && (
                        <span className="tnum mb-1 font-arcade-mono text-[11px] font-bold text-[var(--rt-muted)]">
                          {day.orders}x
                        </span>
                      )}
                      {day.orders > 0 ? (
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full max-w-[34px] rounded-t-xs transition-colors ${
                            isSelected || isPeak
                              ? day.weekend
                                ? "bg-red-500"
                                : "bg-[var(--rt-accent)]"
                              : day.weekend
                                ? "bg-red-500/60"
                                : "bg-[var(--rt-teal)]/80"
                          }`}
                        />
                      ) : (
                        <div className="h-1 w-full max-w-[34px] rounded-xs bg-[var(--rt-border-soft)]" />
                      )}
                    </button>
                  )
                })}
              </div>

              <div className="mt-2 flex gap-1.5 text-center font-arcade-mono text-[11px] font-bold sm:gap-2 sm:text-[12px]">
                {weekdayRhythm.map((day) => (
                  <span
                    key={day.short}
                    className={`flex-1 ${
                      day.weekend
                        ? "text-red-700 dark:text-red-400"
                        : activeWeekday?.idx === day.idx
                          ? "text-[var(--rt-ink)]"
                          : "text-[var(--rt-muted)]"
                    }`}
                  >
                    {day.short}
                  </span>
                ))}
              </div>

              <div className="mt-auto pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--rt-border-soft)] bg-[var(--rt-surface-alt)] px-3 py-2 font-arcade-mono text-[12px]">
                {activeWeekday && activeWeekday.orders > 0 ? (
                  <>
                    <span className="font-bold text-[var(--rt-ink)]">
                      {activeWeekday.short} · {activeWeekday.orders}{" "}
                      {activeWeekday.orders === 1 ? "bill" : "bills"}
                    </span>
                    <span className="tnum text-[var(--rt-muted)]">
                      {formatRupiah(activeWeekday.spend)} · avg{" "}
                      <strong className="text-[var(--rt-ink)]">
                        {formatRupiah(
                          Math.round(activeWeekday.spend / activeWeekday.orders)
                        )}
                      </strong>
                    </span>
                  </>
                ) : (
                  <span className="text-[var(--rt-muted)]">
                    No orders on {activeWeekday?.short ?? "this day"} yet
                  </span>
                )}
                </div>
              </div>
            </div>
          </div>

          {/* 3. Real Cost Breakdown (Menu -> Vouchers -> Net + Tips) */}
          <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="rt2-display text-2xl font-extrabold">
                Real cost breakdown
              </h2>
              <span className="tnum rounded border border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] px-2 py-0.5 font-arcade-mono text-[12px] font-bold text-[var(--rt-teal-ink)]">
                Saved {costBreakdown.savedRate}% via group promos
              </span>
            </div>

            {/* Proportional stacked bar against menu value + tips */}
            {(() => {
              const barTotal = Math.max(
                costBreakdown.netBills +
                  costBreakdown.tips +
                  costBreakdown.saved,
                1
              )
              const netW = (costBreakdown.netBills / barTotal) * 100
              const tipW = (costBreakdown.tips / barTotal) * 100
              const savedW = (costBreakdown.saved / barTotal) * 100
              return (
                <div className="mt-3 flex h-3.5 w-full overflow-hidden rounded-sm border border-[var(--rt-border)] bg-[var(--rt-bg)]">
                  <div
                    title={`Net bills: ${formatRupiah(costBreakdown.netBills)}`}
                    style={{ width: `${netW}%` }}
                    className="h-full bg-[var(--rt-accent)]"
                  />
                  <div
                    title={`Tips: ${formatRupiah(costBreakdown.tips)}`}
                    style={{ width: `${tipW}%` }}
                    className="h-full bg-[var(--rt-amber)]"
                  />
                  <div
                    title={`Voucher savings: ${formatRupiah(costBreakdown.saved)}`}
                    style={{ width: `${savedW}%` }}
                    className="h-full bg-[var(--rt-teal)]"
                  />
                </div>
              )
            })()}

            <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded border border-[var(--rt-border-soft)] bg-[var(--rt-surface-alt)] p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--rt-muted)]">
                  <span className="h-2 w-2 rounded-xs bg-[var(--rt-accent)]" />
                  Net bills
                </p>
                <p className="tnum mt-0.5 font-arcade-mono text-[16px] font-bold">
                  {formatRupiah(costBreakdown.netBills)}
                </p>
                <p className="tnum text-[11px] text-[var(--rt-muted)]">
                  Incl. ~{formatRupiah(costBreakdown.fees)} fees
                </p>
              </div>
              <div className="rounded border border-[var(--rt-border-soft)] bg-[var(--rt-surface-alt)] p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--rt-muted)]">
                  <span className="h-2 w-2 rounded-xs bg-[var(--rt-amber)]" />
                  Tips
                </p>
                <p className="tnum mt-0.5 font-arcade-mono text-[16px] font-bold text-[var(--rt-amber-ink)]">
                  +{formatRupiah(costBreakdown.tips)}
                </p>
                <p className="text-[11px] text-[var(--rt-muted)]">
                  Added to tip jar
                </p>
              </div>
              <div className="rounded border border-[var(--rt-border-soft)] bg-[var(--rt-surface-alt)] p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--rt-muted)]">
                  <span className="h-2 w-2 rounded-xs bg-[var(--rt-teal)]" />
                  Vouchers saved
                </p>
                <p className="tnum mt-0.5 font-arcade-mono text-[16px] font-bold text-[var(--rt-teal-ink)]">
                  -{formatRupiah(costBreakdown.saved)}
                </p>
                <p className="tnum text-[11px] text-[var(--rt-muted)]">
                  {costBreakdown.savedRate}% off{" "}
                  {fmtCompactRp(costBreakdown.menuValue)} menu
                </p>
              </div>
              <div className="rounded border border-[var(--rt-border-soft)] bg-[var(--rt-surface-alt)] p-3">
                <p className="text-[12px] font-bold text-[var(--rt-muted)]">
                  Out of pocket
                </p>
                <p className="tnum mt-0.5 font-arcade-mono text-[16px] font-bold text-[var(--rt-ink)]">
                  {formatRupiah(costBreakdown.outOfPocket)}
                </p>
                <p className="text-[11px] text-[var(--rt-muted)]">
                  Net bills + tips
                </p>
              </div>
            </div>
          </div>

          {/* 4. Top Merchants & Repeat Orders (compact two-column card) */}
          <div className="grid gap-5 md:grid-cols-2">
            {/* Where it goes */}
            <div className="min-w-0 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="rt2-display text-2xl font-extrabold">
                  Where it goes
                </h2>
                <span className="font-arcade-mono text-[13px] text-[var(--rt-muted)]">
                  {merchantSplit.length} merchants
                </span>
              </div>

              {merchantSplit.length === 0 ? (
                <p className="mt-4 text-[14px] text-[var(--rt-muted)]">
                  No merchant history yet.
                </p>
              ) : (
                <>
                  <ul className="mt-3.5 space-y-3">
                    {(showAllMerchants
                      ? merchantSplit
                      : merchantSplit.slice(0, 8)
                    ).map((m, idx) => {
                      const sharePct =
                        totalMerchantSpend > 0
                          ? Math.round((m.spend / totalMerchantSpend) * 100)
                          : 0
                      const avgTicket = Math.round(
                        m.spend / Math.max(m.orders, 1)
                      )
                      const color =
                        MERCHANT_COLORS[idx % MERCHANT_COLORS.length]
                      return (
                        <li key={m.merchant} className="space-y-1">
                          <div className="flex items-baseline justify-between gap-2 text-[14px]">
                            <span className="flex min-w-0 items-center gap-2 font-bold">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-xs"
                                style={{ backgroundColor: color }}
                              />
                              <span className="truncate">{m.merchant}</span>
                              <span className="tnum shrink-0 font-arcade-mono text-[11px] font-semibold text-[var(--rt-muted)]">
                                {sharePct}%
                              </span>
                            </span>
                            <span className="tnum shrink-0 font-arcade-mono text-[13px] font-bold">
                              {formatRupiah(m.spend)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-xs bg-[var(--rt-bg)]">
                              <div
                                className="h-full"
                                style={{
                                  width: `${sharePct}%`,
                                  backgroundColor: color,
                                }}
                              />
                            </div>
                            <span className="tnum shrink-0 font-arcade-mono text-[11px] text-[var(--rt-muted)]">
                              {m.orders}x · avg {fmtCompactRp(avgTicket)}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  {merchantSplit.length > 8 && (
                    <div className="mt-3 border-t border-[var(--rt-border-soft)] pt-3">
                      <button
                        type="button"
                        onClick={() => setShowAllMerchants((v) => !v)}
                        className="rt2-focus rt2-btn-secondary w-full min-h-[36px] rounded px-3 text-[13px] font-bold"
                      >
                        {showAllMerchants
                          ? "Show less"
                          : `Show more (${merchantSplit.length - 8} more)`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Repeat spots (ranked by order frequency) */}
            <div className="min-w-0 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="rt2-display text-2xl font-extrabold">
                  The usual spots
                </h2>
                <span className="font-arcade-mono text-[12px] text-[var(--rt-muted)]">
                  By frequency
                </span>
              </div>

              {frequentSpots.length === 0 ? (
                <p className="mt-4 text-[14px] text-[var(--rt-muted)]">
                  No order history yet.
                </p>
              ) : (
                <ul className="mt-3.5 divide-y divide-[var(--rt-border-soft)]">
                  {frequentSpots.map((spot) => (
                    <li
                      key={spot.merchant}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`tnum inline-flex h-6 min-w-[30px] shrink-0 items-center justify-center rounded border px-1.5 font-arcade-mono text-[12px] font-bold ${
                            spot.orders >= 2
                              ? "border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
                              : "border-[var(--rt-border-soft)] bg-[var(--rt-surface-alt)] text-[var(--rt-muted)]"
                          }`}
                        >
                          {spot.orders}x
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-bold">
                            {spot.merchant}
                          </p>
                          {hasRepeatSpot && (
                            <div className="mt-1 h-1 w-24 overflow-hidden rounded-xs bg-[var(--rt-bg)]">
                              <div
                                className="h-full bg-[var(--rt-teal)]"
                                style={{
                                  width: `${Math.round((spot.orders / maxFreqOrders) * 100)}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="tnum shrink-0 font-arcade-mono text-[13px] font-bold text-[var(--rt-muted)]">
                        {formatRupiah(spot.spend)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Order History */}
          <div
            id="order-history"
            className="scroll-mt-24 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5"
          >
            <h2 className="rt2-display text-2xl font-extrabold">
              Order history ({orderHistory.length})
            </h2>

            {orderHistory.length === 0 ? (
              <p className="py-8 text-[15px] text-[var(--rt-muted)]">
                No orders this month. Orders appear here after the next group
                order.
              </p>
            ) : (
              <>
                <div className="mt-4 divide-y divide-[var(--rt-border-soft)]">
                  {(showAllOrders
                    ? orderHistory
                    : orderHistory.slice(0, 8)
                  ).map(({ bill, split }, idx) => {
                    const firstUnpaidIdx = orderHistory.findIndex(
                      (o) => o.split.status !== "paid"
                    )
                    const isFirstUnpaid = idx === firstUnpaidIdx
                    const status =
                      split.status === "paid"
                        ? "paid"
                        : player.pendingClaim
                          ? "pending"
                          : "unpaid"
                    const tip =
                      split.paidAmount !== null
                        ? Math.max(0, split.paidAmount - split.totalOwed)
                        : 0
                    const itemsSummary = split.items
                      .map((i) => `${i.qty}x ${i.name}`)
                      .join(", ")

                    return (
                      <Link
                        key={bill.id}
                        id={isFirstUnpaid ? "first-unpaid-bill" : undefined}
                        to="/b/$publicId"
                        params={{ publicId: bill.publicId }}
                        className="rt2-focus rt2-row-hover grid min-h-[64px] scroll-mt-24 grid-cols-1 gap-2 px-2 py-3 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-2.5">
                            <span className="font-arcade-mono text-[14px] text-[var(--rt-muted)]">
                              {fmtDate(bill.orderDate)}
                            </span>
                            <span className="rt2-row-title text-[16px] font-bold">
                              {bill.merchant}
                            </span>
                          </div>
                          <p
                            title={itemsSummary}
                            className="truncate text-[14px] text-[var(--rt-muted)]"
                          >
                            {itemsSummary}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <span className="tnum font-arcade-mono text-[17px] font-bold">
                            {formatRupiah(split.totalOwed)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-arcade-mono text-[14px] font-bold ${
                              status === "paid"
                                ? "bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
                                : status === "pending"
                                  ? "bg-[var(--rt-amber-soft)] text-[var(--rt-amber-ink)]"
                                  : "bg-[var(--rt-accent-soft)] text-[var(--rt-accent-ink)]"
                            }`}
                          >
                            {status === "paid" && <Check size={14} weight="bold" />}
                            {status === "pending" && <Clock size={14} weight="bold" />}
                            {status === "unpaid" && <Warning size={14} weight="bold" />}
                            {status[0].toUpperCase() + status.slice(1)}
                          </span>
                          {tip > 0 && (
                            <span className="tnum font-arcade-mono text-[14px] font-bold text-[var(--rt-teal-ink)]">
                              +{formatRupiah(tip)} tip
                            </span>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
                {orderHistory.length > 8 && (
                  <div className="mt-3 border-t border-[var(--rt-border-soft)] pt-3">
                    <button
                      type="button"
                      onClick={() => setShowAllOrders((v) => !v)}
                      className="rt2-focus rt2-btn-secondary w-full min-h-[38px] rounded px-3 text-[13px] font-bold"
                    >
                      {showAllOrders
                        ? "Show less"
                        : `Show more (${orderHistory.length - 8} more)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* The Crew (v1 companions) */}
          {companions.length > 0 && (
            <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
              <div className="flex items-center gap-2">
                <Users size={18} weight="bold" className="text-[var(--rt-muted)]" />
                <h2 className="rt2-display text-2xl font-extrabold">The crew</h2>
              </div>
              <p className="mt-0.5 text-[14px] text-[var(--rt-muted)]">
                Squadmates who share the most orders with {player.name}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {companions.map(({ player: mate, billCount }) => (
                  <PlayerHoverCard key={mate.id} player={mate}>
                    <Link
                      to="/players/$playerId"
                      params={{ playerId: mate.id }}
                      viewTransition
                      onPointerDown={(e) =>
                        prepareHeroPlayerTransition(e.currentTarget)
                      }
                      className="rt2-focus rt2-btn-secondary inline-flex items-center gap-2 rounded py-1.5 pr-3 pl-1.5 font-arcade-mono text-[13px] font-bold"
                    >
                      <PlayerAvatar player={mate} size="sm" heroAttr />
                      <span data-hero-name="">{mate.name}</span>
                      <CurrentMonthBadgeCue
                        badges={mate.currentMonthBadges}
                        size="xs"
                      />
                      <span className="tnum text-[var(--rt-muted)]">
                        {billCount}x
                      </span>
                    </Link>
                  </PlayerHoverCard>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="min-w-0 lg:col-span-4">
          <div className="lg:sticky lg:top-20">
            <PayAllCard
              player={player}
              players={players}
              role={role}
              onSignIn={() => void handleSignIn()}
              onNotify={handleNotify}
              onPreviewChange={setPreview}
            />
          </div>
        </aside>
      </section>

      <AvatarUploadDialog
        open={avatarDialogOpen}
        onOpenChange={setAvatarDialogOpen}
        player={player}
        onSave={async (blob) => {
          const url = await uploadMyAvatar(blob)
          if (url) await loadDetail()
        }}
        onRemove={async () => {
          const ok = await removeMyAvatar()
          if (ok) await loadDetail()
        }}
      />
    </div>
  )
}
