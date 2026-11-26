import {
  ArrowRight,
  CaretRight,
  Check,
  Receipt,
  Trophy,
} from "@phosphor-icons/react"
import { Link, createFileRoute } from "@tanstack/react-router"

import {
  BillBossAvatar,
  HpBar,
  HpBarLegend,
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
    return aMine - bMine
  })

  const sortedPlayers = [...players].sort((a, b) => {
    const unpaidDiff = getPlayerUnpaidTotal(b) - getPlayerUnpaidTotal(a)
    if (unpaidDiff !== 0) return unpaidDiff
    const countDiff = b.unpaidBills.length - a.unpaidBills.length
    if (countDiff !== 0) return countDiff
    return a.name.localeCompare(b.name)
  })
  const openDebtors = sortedPlayers.filter((p) => p.unpaidBills.length > 0)
  const totalOutstanding = openDebtors.reduce(
    (s, p) => s + getPlayerUnpaidTotal(p),
    0
  )

  if (loading && players.length === 0) {
    return <PageLoading label="Loading board..." />
  }

  return (
    <>
      {/* Global Open Status Row (unpaid bills across all months) */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--rt-border-soft)] pb-3.5 text-[15px]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 font-arcade-mono">
          {openDebtors.length > 0 ? (
            <div className="flex items-baseline gap-2.5">
              <span className="font-ui-sans text-[14px] font-semibold text-[var(--rt-muted)]">
                Open total
              </span>
              <strong className="tnum text-[18px] text-[var(--rt-accent-ink)]">
                {formatRupiah(totalOutstanding)}
              </strong>
              <span className="font-ui-sans text-[14px] text-[var(--rt-muted)]">
                ({openDebtors.length}{" "}
                {openDebtors.length === 1 ? "player" : "players"},{" "}
                {unpaidBills.length}{" "}
                {unpaidBills.length === 1 ? "bill" : "bills"})
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-ui-sans text-[15px] font-bold text-[var(--rt-teal-ink)]">
              <Check size={16} weight="bold" />
              All office bills are settled
            </span>
          )}
        </div>

        {you && (
          <Link
            to="/players/$playerId"
            params={{ playerId: you.id }}
            className="rt2-focus inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-[15px] font-bold text-[var(--rt-accent-ink)] hover:underline"
          >
            <PlayerAvatar player={you} size="sm" />
            <span>Open {you.name}’s dossier</span>
            <ArrowRight size={15} weight="bold" />
          </Link>
        )}
      </section>

      {/* Wrapped Squad Roster Grid (sorted by most unpaid then name, no scroll) */}
      <section aria-label="Who are you?">
        <div className="mb-2.5 flex min-h-[28px] flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-[14px] font-bold text-[var(--rt-muted)]">
              Who are you? Pick a callsign
            </p>
            {me.linkedPlayerId && you && you.id !== me.linkedPlayerId && (
              <button
                type="button"
                onClick={() => setActivePlayerId(me.linkedPlayerId!)}
                className="rt2-focus cursor-pointer rounded border border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-2 py-0.5 font-arcade-mono text-[12px] font-bold text-[var(--rt-accent-ink)] hover:border-[var(--rt-accent)]"
              >
                Back to me
              </button>
            )}
          </div>
          <span className="tnum font-arcade-mono text-[12px] font-semibold text-[var(--rt-muted)]">
            {openDebtors.length} open · {sortedPlayers.length - openDebtors.length}{" "}
            clear
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sortedPlayers.map((p) => {
            const pOwed = getPlayerUnpaidTotal(p)
            const active = you !== null && p.id === you.id
            const isSelf = me.linkedPlayerId === p.id
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => setActivePlayerId(p.id)}
                className={`rt2-focus rt2-roster-chip w-full text-left ${
                  active
                    ? "bg-[var(--rt-accent)]"
                    : pOwed > 0
                      ? "bg-[var(--rt-ui-border)]"
                      : "bg-[var(--rt-ui-border)]"
                }`}
              >
                <div
                  className={`rt2-roster-chip-inner flex min-h-[58px] w-full items-center gap-2 px-2.5 py-2 sm:gap-2.5 sm:px-3 ${
                    active
                      ? "bg-[var(--rt-accent)] text-[var(--rt-accent-fg)]"
                      : "bg-[var(--rt-surface-alt)] text-[var(--rt-ink)]"
                  }`}
                >
                  <PlayerAvatar player={p} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[14px] font-bold">
                      <span className="truncate">
                        {p.name}
                        {p.unpaidBills.length > 0
                          ? ` (${p.unpaidBills.length})`
                          : ""}
                      </span>
                      {isSelf && (
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 font-arcade-mono text-[9px] leading-none font-bold uppercase ${
                            active
                              ? "border border-current text-current"
                              : "bg-[var(--rt-accent-soft)] text-[var(--rt-accent-ink)]"
                          }`}
                        >
                          You
                        </span>
                      )}
                    </div>
                    <p
                      className={`tnum truncate font-arcade-mono text-[13px] font-semibold whitespace-nowrap ${
                        active
                          ? ""
                          : pOwed > 0
                            ? "text-[var(--rt-accent-ink)]"
                            : "text-[var(--rt-teal-ink)]"
                      }`}
                    >
                      {pOwed > 0 ? formatRupiah(pOwed) : "All clear"}
                    </p>
                  </div>
                  {pOwed === 0 && (
                    <Check
                      size={14}
                      weight="bold"
                      className={`shrink-0 ${
                        active ? "" : "text-[var(--rt-teal-ink)]"
                      }`}
                    />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* ============================================================
          BILLS TO PAY (4-COL PAY-ALL + 8-COL BOSS BILLS)
         ============================================================ */}
      <section id="bills" className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-[var(--rt-border)] pb-2">
            <h1 className="rt2-display text-3xl font-extrabold">
              Bills to pay ({unpaidBills.length} open)
            </h1>
            {unpaidBills.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                <HpBarLegend />
                <span className="text-[14px] text-[var(--rt-muted)]">
                  Hover any bar chunk for details
                </span>
              </div>
            )}
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
                          <span className="tnum font-arcade-mono text-[14px] font-bold text-[var(--rt-teal-ink)]">
                            {bill.paidCount} of {bill.totalPlayers} paid
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
    </>
  )
}
