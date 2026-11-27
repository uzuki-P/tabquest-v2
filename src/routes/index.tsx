import {
  ArrowCounterClockwise,
  ArrowRight,
  CaretRight,
  Check,
  Receipt,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import {
  CurrentMonthBadgeCue,
  PlayerHoverCard,
} from "@/components/telemetry/PlayerHoverCard"
import { StandingShiftButton } from "@/components/telemetry/StandingCelebration"
import {
  BillBossAvatar,
  HpBar,
  PageLoading,
  PayAllCard,
  PlayerAvatar,
  fmtDate,
} from "@/components/telemetry/components"
import { formatRupiah } from "@/domain/money"
import { getBillRemainingAmount, getPlayerUnpaidTotal } from "@/domain/types"
import { useAppStore } from "@/lib/app-store"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const [expandedRoster, setExpandedRoster] = useState(false)
  const {
    loading,
    players,
    unpaidBills: allUnpaidBills,
    me,
    role,
    you,
    setActivePlayerId,
    preview,
    setPreview,
    hit,
    handleNotify,
    handleSignIn,
  } = useAppStore()

  const unpaidBills = [...allUnpaidBills].sort((a, b) => {
    const aMine =
      you && a.splits.some((s) => s.playerId === you.id && s.status === "unpaid")
        ? 0
        : 1
    const bMine =
      you && b.splits.some((s) => s.playerId === you.id && s.status === "unpaid")
        ? 0
        : 1
    if (aMine !== bMine) return aMine - bMine
    return a.merchant.localeCompare(b.merchant)
  })

  const sortedPlayers = [...players].sort((a, b) => {
    const aHasOpen = a.unpaidBills.length > 0 ? 0 : 1
    const bHasOpen = b.unpaidBills.length > 0 ? 0 : 1
    if (aHasOpen !== bHasOpen) return aHasOpen - bHasOpen
    return a.name.localeCompare(b.name)
  })
  const openDebtors = sortedPlayers.filter((p) => p.unpaidBills.length > 0)
  const clearPlayers = sortedPlayers.filter((p) => p.unpaidBills.length === 0)
  const isPeeking = Boolean(
    me.linkedPlayerId && you && you.id !== me.linkedPlayerId
  )
  const totalOutstanding = openDebtors.reduce(
    (s, p) => s + getPlayerUnpaidTotal(p),
    0
  )

  if (loading && players.length === 0) {
    return <PageLoading label="Loading board..." />
  }

  return (
    <>
      {/* Unified Telemetry Deck: Open total + controls + animated Avatar Rail */}
      <section
        aria-label="Who are you?"
        className="rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)]"
      >
        {/* Integrated card header */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-t-[2px] border-b border-[var(--rt-border-soft)] bg-[var(--rt-surface-alt)]/55 px-3.5 py-2.5 sm:px-4">
          {openDebtors.length > 0 ? (
            <div className="flex items-baseline gap-2.5 font-arcade-mono">
              <span className="font-ui-sans text-[14px] font-semibold text-[var(--rt-muted)]">
                Open total
              </span>
              <strong className="tnum text-[18px] text-[var(--rt-accent-ink)]">
                {formatRupiah(totalOutstanding)}
              </strong>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-ui-sans text-[15px] font-bold text-[var(--rt-teal-ink)]">
              <Check size={16} weight="bold" />
              All office bills are settled
            </span>
          )}

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                if (me.linkedPlayerId) setActivePlayerId(me.linkedPlayerId)
              }}
              aria-hidden={!isPeeking}
              tabIndex={isPeeking ? 0 : -1}
              className={`rt2-focus inline-flex min-h-[30px] items-center gap-1 rounded border border-[var(--rt-accent)] bg-[var(--rt-accent-soft)] px-2.5 font-arcade-mono text-[11px] font-bold text-[var(--rt-accent-ink)] transition-[opacity,background-color,color] duration-150 hover:bg-[var(--rt-accent)] hover:text-[var(--rt-accent-fg)] ${
                isPeeking
                  ? "cursor-pointer opacity-100"
                  : "pointer-events-none invisible opacity-0"
              }`}
            >
              <ArrowCounterClockwise size={12} weight="bold" />
              Back to me
            </button>

            <button
              type="button"
              onClick={() => setExpandedRoster((v) => !v)}
              aria-pressed={expandedRoster}
              className="rt2-focus inline-flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded border border-transparent px-2 font-arcade-mono text-[12px] font-bold text-[var(--rt-muted)] transition-colors hover:border-[var(--rt-ui-border)] hover:bg-[var(--rt-surface-alt)] hover:text-[var(--rt-accent-ink)]"
            >
              <UsersThree size={15} weight="bold" />
              <span>
                {expandedRoster
                  ? "Compact rail"
                  : `Show all names (${sortedPlayers.length})`}
              </span>
            </button>

            {you && (
              <>
                <span
                  aria-hidden="true"
                  className="hidden h-4 w-px bg-[var(--rt-border-soft)] sm:inline-block"
                />
                <Link
                  to="/players/$playerId"
                  params={{ playerId: you.id }}
                  aria-label={`${you.name}’s dossier`}
                  className="rt2-focus inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 text-[14px] font-bold text-[var(--rt-accent-ink)] hover:underline"
                >
                  <PlayerAvatar player={you} size="sm" />
                  <span>{you.name}’s dossier</span>
                  <ArrowRight size={14} weight="bold" />
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Animated Avatar Rail */}
        <div className="px-3.5 py-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Open debtors: always shown as named pills with amount */}
            {openDebtors.map((p) => {
              const owed = getPlayerUnpaidTotal(p)
              const active = you !== null && p.id === you.id
              const isSelf = me.linkedPlayerId === p.id
              return (
                <PlayerHoverCard key={p.id} player={p}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setActivePlayerId(p.id)}
                    className={`rt2-focus inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border-2 py-1 pr-3 pl-1.5 transition-[background-color,border-color,color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
                      active
                        ? "border-[var(--rt-accent)] bg-[var(--rt-accent)] text-[var(--rt-accent-fg)]"
                        : "border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] text-[var(--rt-ink)] hover:border-[var(--rt-border)]"
                    }`}
                  >
                    <PlayerAvatar player={p} size="sm" />
                    <span className="text-[13px] font-bold">{p.name}</span>
                    {isSelf && (
                      <span
                        className={`rounded px-1 py-0.5 font-arcade-mono text-[9px] leading-none font-bold uppercase ${
                          active
                            ? "border border-current text-current"
                            : "bg-[var(--rt-accent-soft)] text-[var(--rt-accent-ink)]"
                        }`}
                      >
                        You
                      </span>
                    )}
                    <span
                      className={`tnum font-arcade-mono text-[12px] font-bold ${
                        active ? "" : "text-[var(--rt-accent-ink)]"
                      }`}
                    >
                      {formatRupiah(owed)}
                    </span>
                    <CurrentMonthBadgeCue
                      badges={p.currentMonthBadges}
                      size="xs"
                      inverted={active}
                    />
                  </button>
                </PlayerHoverCard>
              )
            })}

            {/* Clear teammates: smoothly morph between compact avatar dots and named pills */}
            {clearPlayers.map((p) => {
              const active = you !== null && p.id === you.id
              const isSelf = me.linkedPlayerId === p.id
              const showLabel = expandedRoster || active

              return (
                <PlayerHoverCard key={p.id} player={p}>
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={`${p.name} - All clear`}
                    title={showLabel ? undefined : `${p.name} (All clear)`}
                    onClick={() => setActivePlayerId(p.id)}
                    className={`rt2-focus relative inline-flex min-h-[36px] cursor-pointer items-center rounded-full border transition-[background-color,border-color,color,padding,transform,box-shadow,opacity] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] ${
                      active
                        ? "border-[var(--rt-accent)] bg-[var(--rt-accent)] py-1 pr-2.5 pl-1 text-[var(--rt-accent-fg)]"
                        : expandedRoster
                          ? "border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] py-1 pr-2.5 pl-1 text-[var(--rt-ink)] hover:border-[var(--rt-teal)]"
                          : isSelf
                            ? "border-[var(--rt-accent)]/75 bg-transparent p-0.5 text-[var(--rt-ink)] hover:scale-105"
                            : "border-transparent bg-transparent p-0.5 text-[var(--rt-ink)] hover:scale-110"
                    }`}
                  >
                    <span className="relative shrink-0">
                      <PlayerAvatar player={p} size="sm" />
                      <span
                        aria-hidden="true"
                        className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--rt-surface)] bg-[var(--rt-teal)] transition-[opacity,transform] duration-200 ${
                          showLabel
                            ? "scale-0 opacity-0"
                            : "scale-100 opacity-100"
                        }`}
                      />
                    </span>

                    <span
                      className="grid transition-[grid-template-columns,opacity,margin] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        gridTemplateColumns: showLabel ? "1fr" : "0fr",
                        opacity: showLabel ? 1 : 0,
                        marginLeft: showLabel ? "0.375rem" : "0px",
                      }}
                    >
                      <span className="flex items-center gap-1.5 overflow-hidden text-[13px] font-bold whitespace-nowrap">
                        <span>{p.name}</span>
                        {isSelf && (
                          <span
                            className={`rounded px-1 py-0.5 font-arcade-mono text-[9px] leading-none font-bold uppercase ${
                              active
                                ? "border border-current text-current"
                                : "bg-[var(--rt-accent-soft)] text-[var(--rt-accent-ink)]"
                            }`}
                          >
                            You
                          </span>
                        )}
                        <CurrentMonthBadgeCue
                          badges={p.currentMonthBadges}
                          size="xs"
                          inverted={active}
                        />
                        {expandedRoster && (
                          <Check
                            size={12}
                            weight="bold"
                            className={active ? "" : "text-[var(--rt-teal-ink)]"}
                          />
                        )}
                      </span>
                    </span>
                  </button>
                </PlayerHoverCard>
              )
            })}
          </div>
        </div>
      </section>

      {/* ============================================================
          BILLS TO PAY (4-COL PAY-ALL + 8-COL BOSS BILLS)
         ============================================================ */}
      <section id="bills" className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <div className="border-b-2 border-[var(--rt-border)] pb-2">
            <h1 className="rt2-display text-3xl font-extrabold">
              Bills to pay
            </h1>
          </div>
        </div>

        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-20">
            {you && (
              <PayAllCard
                player={you}
                players={players}
                role={role}
                onSignIn={() => void handleSignIn()}
                onNotify={handleNotify}
                onPreviewChange={setPreview}
              />
            )}
          </div>
        </aside>

        <div className="space-y-4 lg:col-span-8">
          {unpaidBills.length === 0 ? (
            <div className="rounded border-2 border-[var(--rt-teal)] bg-[var(--rt-surface)] p-8 text-center">
              <p className="rt2-display text-3xl font-extrabold text-[var(--rt-teal-ink)]">
                All office bills are paid up!
              </p>
              <p className="mt-2 text-[15px] text-[var(--rt-muted)]">
                Nobody owes anything right now. Check the leaderboard or browse
                past orders.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Link
                  to="/ranks"
                  className="rt2-focus rt2-btn-primary inline-flex min-h-[44px] items-center gap-2 rounded px-5 text-[15px] font-bold"
                >
                  <Trophy size={18} weight="bold" />
                  View Ranks
                </Link>
                <Link
                  to="/bills"
                  className="rt2-focus rt2-btn-secondary inline-flex min-h-[44px] items-center gap-2 rounded px-5 text-[15px] font-bold"
                >
                  <Receipt size={18} weight="bold" />
                  Browse past bills
                </Link>
              </div>
            </div>
          ) : (
            unpaidBills.map((bill) => {
              const isMine =
                you !== null &&
                bill.splits.some(
                  (s) => s.playerId === you.id && s.status === "unpaid"
                )
              const remaining = getBillRemainingAmount(bill)

              return (
                <article
                  key={bill.id}
                  className={`rounded border-2 bg-[var(--rt-surface)] p-5 ${
                    isMine
                      ? "border-[var(--rt-border)] pl-6 shadow-[inset_4px_0_0_0_var(--rt-accent)]"
                      : "border-[var(--rt-ui-border)]"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <BillBossAvatar bill={bill} size="sm" />
                    <div className="min-w-0 flex-1">
                      {/* Clean pointer behavior: ONLY header link + HP chunks are clickable */}
                      <Link
                        to="/b/$publicId"
                        params={{ publicId: bill.publicId }}
                        className="rt2-focus rt2-bill-header flex min-h-[44px] w-full flex-wrap items-baseline justify-between gap-2 text-left"
                      >
                        <div className="flex flex-wrap items-baseline gap-2.5">
                          <span className="rt2-bill-title rt2-display text-3xl font-extrabold transition-colors">
                            {bill.merchant}
                          </span>
                          <span className="font-arcade-mono text-[14px] text-[var(--rt-muted)]">
                            {fmtDate(bill.orderDate)}
                          </span>
                        </div>
                        <span className="rt2-bill-action inline-flex items-center gap-1 text-[14px] font-bold text-[var(--rt-accent-ink)]">
                          Bill detail
                          <CaretRight
                            size={14}
                            weight="bold"
                            className="rt2-bill-arrow transition-transform"
                          />
                        </span>
                      </Link>

                      <div className="mt-3">
                        <HpBar
                          bill={bill}
                          players={players}
                          youId={you?.id ?? ""}
                          preview={preview && isMine}
                          hit={hit}
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[14px]">
                        <span className="tnum font-arcade-mono text-[var(--rt-muted)]">
                          <strong className="text-[16px] text-[var(--rt-ink)]">
                            {formatRupiah(remaining)}
                          </strong>{" "}
                          remaining of {formatRupiah(bill.finalTotal)}
                        </span>
                        {isMine && (
                          <span className="font-bold text-[var(--rt-accent-ink)]">
                            Your bill
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </section>

      {/* Compact navigation strip to Archive & Leaderboards */}
      <section className="grid gap-4 border-t border-[var(--rt-border-soft)] pt-5 sm:grid-cols-2">
        <Link
          to="/bills"
          className="rt2-focus rt2-row-hover flex items-center justify-between gap-3 rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] p-4 transition hover:border-[var(--rt-border)]"
        >
          <div className="flex items-center gap-3">
            <Receipt
              size={22}
              weight="bold"
              className="shrink-0 text-[var(--rt-accent-ink)]"
            />
            <div>
              <p className="rt2-row-title text-[16px] font-bold">
                Past bills & monthly archive
              </p>
              <p className="text-[13px] text-[var(--rt-muted)]">
                Filter settled orders by month and week
              </p>
            </div>
          </div>
          <ArrowRight
            size={18}
            weight="bold"
            className="shrink-0 text-[var(--rt-muted)]"
          />
        </Link>

        <Link
          to="/ranks"
          className="rt2-focus rt2-row-hover flex items-center justify-between gap-3 rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] p-4 transition hover:border-[var(--rt-border)]"
        >
          <div className="flex items-center gap-3">
            <Trophy
              size={22}
              weight="bold"
              className="shrink-0 text-[var(--rt-teal-ink)]"
            />
            <div>
              <p className="rt2-row-title text-[16px] font-bold">
                Ranks & tip wall
              </p>
              <p className="text-[13px] text-[var(--rt-muted)]">
                Top tippers, biggest spenders, and voucher savings
              </p>
            </div>
          </div>
          <ArrowRight
            size={18}
            weight="bold"
            className="shrink-0 text-[var(--rt-muted)]"
          />
        </Link>
      </section>

      <StandingShiftButton className="!fixed right-4 bottom-4 z-40 shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:right-6 sm:bottom-6" />
    </>
  )
}
