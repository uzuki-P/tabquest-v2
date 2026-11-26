import {
  Crown,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { PlayerHoverCard } from "@/components/telemetry/PlayerHoverCard"
import {
  EarnedBadgePill,
  MonthStepper,
  PlayerAvatar,
  SegmentedTabs,
  SelectMenu,
  TierPill,
  monthTitleFromKey,
  prepareHeroPlayerTransition,
} from "@/components/telemetry/components"
import { formatRupiah } from "@/domain/money"
import {
  gapToNextSpend,
  getSpendingLeaderboard,
  getTipLeaderboard,
  tierForSpend,
} from "@/domain/types"
import type { PlayerSummary, RanksResponse } from "@/domain/types"
import { useAppStore } from "@/lib/app-store"

export const Route = createFileRoute("/ranks")({
  component: AllRanksRoute,
})

function AllRanksRoute() {
  const {
    players: homePlayers,
    me,
    you,
    selectedMonth,
    availableMonths,
    setSelectedMonth,
  } = useAppStore()
  const [scope, setScope] = useState<"monthly" | "all-time">("monthly")
  const [ranksData, setRanksData] = useState<RanksResponse | null>(null)
  const [query, setQuery] = useState("")
  const [tierFilter, setTierFilter] = useState<string>("All")
  const [sortBy, setSortBy] = useState<"rank" | "name" | "spend" | "tips">(
    "rank"
  )

  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams({ scope })
    if (selectedMonth) qs.set("month", selectedMonth)
    fetch(`/api/public/ranks?${qs.toString()}`)
      .then((res) => (res.ok ? (res.json() as Promise<RanksResponse>) : null))
      .then((data) => {
        if (!cancelled && data) setRanksData(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [scope, selectedMonth])

  const scopedPlayers: PlayerSummary[] = ranksData?.players ?? homePlayers
  const latestMonth =
    ranksData?.availableMonths[0] ?? availableMonths[0] ?? selectedMonth

  const spendBoard = getSpendingLeaderboard(scopedPlayers)
  const tipBoard = getTipLeaderboard(scopedPlayers)
  const topSpend = spendBoard[0]?.monthlySpend ?? 0
  const totalTipPot = scopedPlayers.reduce((s, p) => s + p.monthlyTips, 0)

  const filterList = (list: PlayerSummary[]) => {
    const q = query.trim().toLowerCase()
    const filtered = list.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) {
        return false
      }
      if (
        tierFilter !== "All" &&
        tierForSpend(p.monthlySpend, topSpend) !== tierFilter
      ) {
        return false
      }
      return true
    })
    if (sortBy === "name")
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === "spend")
      return [...filtered].sort((a, b) => b.monthlySpend - a.monthlySpend)
    if (sortBy === "tips")
      return [...filtered].sort((a, b) => b.monthlyTips - a.monthlyTips)
    return filtered
  }

  const shownSpenders = filterList(spendBoard)
  const shownTippers = filterList(tipBoard)
  const tiers = ["All", "Final Boss", "Miniboss", "Regular", "Rookie"] as const

  const getPlayerTipStats = (player: PlayerSummary) => {
    const count = player.tippedBillsCount
    const avg = count > 0 ? Math.round(player.monthlyTips / count) : 0
    return { tippedBills: count, avg }
  }

  const monthLabel = monthTitleFromKey(selectedMonth)
  const hasMonthlyActivity = scopedPlayers.some(
    (p) => p.ordersCount > 0 || p.monthlySpend > 0
  )

  return (
    <div className="space-y-6">
      {/* Header Row: Title + Inline Scope (Monthly | All time) + Month Switcher + Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="rt2-display text-4xl font-extrabold sm:text-5xl">
            All ranks
          </h1>

          <SegmentedTabs
            ariaLabel="Rankings time range"
            value={scope}
            onChange={setScope}
            options={[
              { id: "monthly", label: "Monthly" },
              { id: "all-time", label: "All time" },
            ]}
          />

          {scope === "monthly" && (
            <MonthStepper
              monthKey={selectedMonth}
              latestMonthKey={latestMonth}
              onChange={setSelectedMonth}
            />
          )}
        </div>

        <div className="rt2-search-box relative flex h-11 w-full max-w-xs items-center rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)]">
          <MagnifyingGlass
            size={18}
            className="rt2-search-icon ml-3 shrink-0 text-[var(--rt-muted)]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player name"
            aria-label="Search players"
            className="h-full w-full bg-transparent px-2.5 text-[15px] text-[var(--rt-ink)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="rt2-focus flex h-10 w-10 cursor-pointer items-center justify-center text-[var(--rt-muted)] hover:text-[var(--rt-ink)]"
            >
              <X size={16} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {scope === "monthly" && !hasMonthlyActivity && selectedMonth !== latestMonth ? (
        <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-10 text-center">
          <h2 className="rt2-display text-4xl font-extrabold">
            No rankings archived for {monthLabel}
          </h2>
          <p className="mt-2 text-[15px] text-[var(--rt-muted)]">
            Switch to All time for cumulative stats, or jump back to{" "}
            {monthTitleFromKey(latestMonth)}.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedMonth(latestMonth)}
              className="rt2-focus rt2-btn-primary min-h-[44px] rounded px-5 py-2 text-[15px] font-bold"
            >
              Back to Latest
            </button>
            <button
              type="button"
              onClick={() => setScope("all-time")}
              className="rt2-focus rt2-btn-secondary min-h-[44px] rounded px-5 py-2 text-[15px] font-bold"
            >
              View All time ranks
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              {tiers.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  aria-pressed={tierFilter === tier}
                  onClick={() => setTierFilter(tier)}
                  className={`rt2-focus h-[40px] cursor-pointer rounded border-2 px-3 text-[14px] font-bold transition ${
                    tierFilter === tier
                      ? "border-[var(--rt-ink)] bg-[var(--rt-ink)] text-[var(--rt-surface)]"
                      : "rt2-btn-secondary"
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>

            <SelectMenu
              ariaLabel="Sort players"
              prefix="Sort:"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: "rank", label: "Rank" },
                { value: "name", label: "Name" },
                { value: "spend", label: "Spend" },
                { value: "tips", label: "Tips" },
              ]}
            />
          </div>

          {shownSpenders.length === 0 && shownTippers.length === 0 ? (
            <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-8 text-center">
              <p className="text-[16px] font-bold">
                No pilots match "{query || tierFilter}".
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("")
                  setTierFilter("All")
                }}
                className="rt2-focus rt2-btn-primary mt-3 min-h-[44px] rounded px-4 text-[15px] font-bold"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              {/* Full Spender Rank */}
              <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-3.5 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[var(--rt-border)] pb-3">
                  <h2 className="rt2-display text-2xl font-extrabold sm:text-3xl">
                    Spending rank ({shownSpenders.length})
                  </h2>
                  <span className="font-arcade-mono text-[13px] text-[var(--rt-muted)] sm:text-[14px]">
                    {scope === "all-time" ? "All time" : monthLabel}
                  </span>
                </div>

                <div className="mt-2 divide-y-2 divide-[var(--rt-ui-border)] sm:mt-3">
                  {shownSpenders.map((p) => {
                    const rank = spendBoard.findIndex((x) => x.id === p.id) + 1
                    const tier = tierForSpend(p.monthlySpend, topSpend)
                    const gap = gapToNextSpend(p.id, spendBoard)
                    const showYouBadge = me.authenticated
                      ? me.linkedPlayerId !== null && p.id === me.linkedPlayerId
                      : you !== null && p.id === you.id

                    return (
                      <Link
                        key={p.id}
                        to="/players/$playerId"
                        params={{ playerId: p.id }}
                        viewTransition
                        onPointerDown={(e) =>
                          prepareHeroPlayerTransition(e.currentTarget)
                        }
                        className={`rt2-focus rt2-row-hover grid grid-cols-1 gap-2.5 px-2.5 py-3 text-left sm:min-h-[96px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-3 sm:py-4 ${
                          showYouBadge
                            ? "border-l-4 border-l-[var(--rt-accent)] bg-[var(--rt-accent-soft)]"
                            : ""
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                          <span className="rt2-display flex w-6 shrink-0 items-center justify-center text-2xl font-extrabold text-[var(--rt-muted)] sm:w-7 sm:text-3xl">
                            {rank === 1 ? (
                              <Crown
                                size={20}
                                weight="fill"
                                className="text-[var(--rt-amber)]"
                              />
                            ) : (
                              rank
                            )}
                          </span>
                          <PlayerAvatar player={p} size="md" heroAttr />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <PlayerHoverCard player={p}>
                                <span
                                  data-hero-name=""
                                  className="rt2-row-title truncate text-[16px] font-bold sm:text-[17px]"
                                >
                                  {p.name}
                                </span>
                              </PlayerHoverCard>
                              {showYouBadge && (
                                <span className="rounded bg-[var(--rt-accent)] px-1.5 py-0.5 font-arcade-mono text-[11px] font-bold text-[var(--rt-accent-fg)] sm:text-[12px]">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <TierPill tier={tier} />
                              {p.badge && <EarnedBadgePill badge={p.badge} />}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-[var(--rt-border-soft)] pt-2 sm:block sm:border-t-0 sm:pt-0 sm:text-right">
                          <p className="tnum font-arcade-mono text-[16px] font-bold whitespace-nowrap sm:text-[18px]">
                            {formatRupiah(p.monthlySpend)}
                          </p>
                          <div className="flex flex-wrap items-baseline gap-x-2.5 sm:block">
                            <p className="tnum text-[13px] whitespace-nowrap text-[var(--rt-teal-ink)] sm:text-[14px]">
                              Saved {formatRupiah(p.savedDiscount)} ({p.savedPct}%)
                            </p>
                            <p className="tnum text-[13px] font-bold whitespace-nowrap text-[var(--rt-accent-ink)] sm:text-[14px]">
                              {gap
                                ? `Steal #${gap.targetRank} for ${formatRupiah(gap.amount)}`
                                : "Holds #1"}
                            </p>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>

              {/* Full Tip Rank */}
              <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-3.5 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[var(--rt-border)] pb-3">
                  <h2 className="rt2-display text-2xl font-extrabold sm:text-3xl">
                    Terima Kasih Orang Baik ({shownTippers.length})
                  </h2>
                  <span className="tnum font-arcade-mono text-[15px] font-bold text-[var(--rt-teal-ink)] sm:text-[16px]">
                    Jar {formatRupiah(totalTipPot)}
                  </span>
                </div>

                <div className="mt-2 divide-y-2 divide-[var(--rt-ui-border)] sm:mt-3">
                  {shownTippers.map((p) => {
                    const rank = tipBoard.findIndex((x) => x.id === p.id) + 1
                    const above = rank > 1 ? tipBoard[rank - 2] : null
                    const tipGap = above
                      ? Math.max(1, above.monthlyTips - p.monthlyTips + 1)
                      : null
                    const sharePct =
                      totalTipPot > 0
                        ? ((p.monthlyTips / totalTipPot) * 100).toFixed(1)
                        : "0.0"
                    const showYouBadge = me.authenticated
                      ? me.linkedPlayerId !== null && p.id === me.linkedPlayerId
                      : you !== null && p.id === you.id
                    const stats = getPlayerTipStats(p)

                    return (
                      <Link
                        key={p.id}
                        to="/players/$playerId"
                        params={{ playerId: p.id }}
                        viewTransition
                        onPointerDown={(e) =>
                          prepareHeroPlayerTransition(e.currentTarget)
                        }
                        className={`rt2-focus rt2-row-hover grid grid-cols-1 gap-2.5 px-2.5 py-3 text-left sm:min-h-[96px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-3 sm:py-4 ${
                          showYouBadge
                            ? "border-l-4 border-l-[var(--rt-accent)] bg-[var(--rt-accent-soft)]"
                            : ""
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                          <span className="rt2-display flex w-6 shrink-0 items-center justify-center text-2xl font-extrabold text-[var(--rt-muted)] sm:w-7 sm:text-3xl">
                            {rank === 1 ? (
                              <Crown
                                size={20}
                                weight="fill"
                                className="text-[var(--rt-amber)]"
                              />
                            ) : (
                              rank
                            )}
                          </span>
                          <PlayerAvatar player={p} size="md" heroAttr />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <PlayerHoverCard player={p}>
                                <span
                                  data-hero-name=""
                                  className="rt2-row-title truncate text-[16px] font-bold sm:text-[17px]"
                                >
                                  {p.name}
                                </span>
                              </PlayerHoverCard>
                              {showYouBadge && (
                                <span className="rounded bg-[var(--rt-accent)] px-1.5 py-0.5 font-arcade-mono text-[11px] font-bold text-[var(--rt-accent-fg)] sm:text-[12px]">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {p.badge === "Big heart" && (
                                <EarnedBadgePill badge={p.badge} />
                              )}
                              <span className="tnum font-arcade-mono text-[12px] text-[var(--rt-muted)] sm:text-[13px]">
                                {p.monthlyTips > 0
                                  ? `${stats.tippedBills} ${stats.tippedBills === 1 ? "tip" : "tips"} · Avg +${formatRupiah(stats.avg)}`
                                  : "No tips logged yet"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-[var(--rt-border-soft)] pt-2 sm:block sm:border-t-0 sm:pt-0 sm:text-right">
                          <p className="tnum font-arcade-mono text-[16px] font-bold whitespace-nowrap text-[var(--rt-teal-ink)] sm:text-[18px]">
                            +{formatRupiah(p.monthlyTips)}
                          </p>
                          <div className="flex flex-wrap items-baseline gap-x-2.5 sm:block">
                            <p className="tnum text-[13px] whitespace-nowrap text-[var(--rt-muted)] sm:text-[14px]">
                              {sharePct}% of the jar
                            </p>
                            <p className="tnum text-[13px] font-bold whitespace-nowrap text-[var(--rt-accent-ink)] sm:text-[14px]">
                              {tipGap !== null
                                ? `Take #${rank - 1} for +${formatRupiah(tipGap)}`
                                : "Leader"}
                            </p>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            </div>
          )}

          <p className="text-[15px] text-[var(--rt-muted)]">
            {scopedPlayers.length} players,{" "}
            {scope === "all-time" ? "all-time" : monthLabel} jar total{" "}
            <span className="tnum font-arcade-mono font-bold text-[var(--rt-ink)]">
              {formatRupiah(totalTipPot)}
            </span>
          </p>
        </>
      )}
    </div>
  )
}
