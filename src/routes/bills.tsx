import { ArrowRight, Receipt } from "@phosphor-icons/react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import {
  MonthStepper,
  fmtDate,
  monthTitleFromKey,
} from "@/components/telemetry/components"
import { formatRupiah } from "@/domain/money"
import { getBillDayOfMonth, getMonthWeeks } from "@/domain/types"
import { useAppStore } from "@/lib/app-store"

export const Route = createFileRoute("/bills")({
  component: BillsArchivePage,
})

function BillsArchivePage() {
  const {
    loading,
    players,
    bills,
    selectedMonth,
    availableMonths,
    setSelectedMonth,
  } = useAppStore()

  const [activeWeekId, setActiveWeekId] = useState<string | null>(null)

  const latestMonth = availableMonths[0] ?? selectedMonth
  const monthWeeks = getMonthWeeks(selectedMonth)

  const totalBilled = bills.reduce((s, b) => s + b.finalTotal, 0)
  const totalTipPot = players.reduce((s, p) => s + p.monthlyTips, 0)
  const settledCount = bills.filter((b) => b.paidCount >= b.totalPlayers).length

  const activeWeek = monthWeeks.find((w) => w.id === activeWeekId) ?? null
  const filteredBills = activeWeek
    ? bills.filter((b) => {
        const day = getBillDayOfMonth(b.orderDate)
        return day >= activeWeek.startDay && day <= activeWeek.endDay
      })
    : bills

  if (loading && bills.length === 0) {
    return (
      <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-10 text-center">
        <p className="rt2-display text-3xl font-extrabold">Loading bills...</p>
      </section>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header + Month Stepper + Monthly Totals */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--rt-border-soft)] pb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 font-arcade-mono">
          <MonthStepper
            monthKey={selectedMonth}
            latestMonthKey={latestMonth}
            onChange={(m) => {
              setActiveWeekId(null)
              setSelectedMonth(m)
            }}
          />

          <div className="flex items-baseline gap-2">
            <span className="font-ui-sans text-[14px] font-semibold text-[var(--rt-muted)]">
              Billed
            </span>
            <strong className="tnum text-[18px]">
              {formatRupiah(totalBilled)}
            </strong>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-ui-sans text-[14px] font-semibold text-[var(--rt-muted)]">
              Tipped
            </span>
            <strong className="tnum text-[18px] text-[var(--rt-teal-ink)]">
              {formatRupiah(totalTipPot)}
            </strong>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-ui-sans text-[14px] font-semibold text-[var(--rt-muted)]">
              Settled
            </span>
            <strong className="tnum text-[18px]">
              {settledCount}/{bills.length}
            </strong>
          </div>
        </div>

        <Link
          to="/ranks"
          className="rt2-focus inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 text-[15px] font-bold text-[var(--rt-accent-ink)] hover:underline"
        >
          View monthly ranks
          <ArrowRight size={15} weight="bold" />
        </Link>
      </section>

      {!loading && bills.length === 0 ? (
        <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-10 text-center">
          <Receipt
            size={36}
            weight="bold"
            className="mx-auto text-[var(--rt-muted)]"
          />
          <h1 className="rt2-display mt-3 text-4xl font-extrabold">
            No bills recorded for {monthTitleFromKey(selectedMonth)}
          </h1>
          <p className="mt-2 text-[15px] text-[var(--rt-muted)]">
            Jump back to the latest active month to see recent group orders.
          </p>
          {selectedMonth !== latestMonth && (
            <button
              type="button"
              onClick={() => {
                setActiveWeekId(null)
                setSelectedMonth(latestMonth)
              }}
              className="rt2-focus rt2-btn-primary mt-4 min-h-[44px] rounded px-5 py-2 text-[15px] font-bold"
            >
              Back to {monthTitleFromKey(latestMonth)}
            </button>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="rt2-display text-3xl font-extrabold">
              {monthTitleFromKey(selectedMonth)} bills
            </h1>
            {activeWeek && (
              <div className="flex items-center gap-2 text-[14px] font-bold">
                <span>
                  Showing {activeWeek.label} ({activeWeek.range},{" "}
                  {filteredBills.length}{" "}
                  {filteredBills.length === 1 ? "bill" : "bills"})
                </span>
                <button
                  type="button"
                  onClick={() => setActiveWeekId(null)}
                  className="rt2-focus rt2-btn-secondary min-h-[38px] rounded px-3 text-[14px] font-bold"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <button
              type="button"
              aria-pressed={activeWeekId === null}
              onClick={() => setActiveWeekId(null)}
              className={`rt2-focus min-h-[64px] cursor-pointer rounded border-2 p-3 text-left transition ${
                activeWeekId === null
                  ? "border-[var(--rt-ink)] bg-[var(--rt-ink)] text-[var(--rt-surface)]"
                  : "rt2-btn-secondary"
              }`}
            >
              <p className="text-[15px] font-bold">All weeks</p>
              <p className="font-arcade-mono text-[14px] opacity-85">
                {bills.length} {bills.length === 1 ? "order" : "orders"}
              </p>
            </button>

            {monthWeeks.map((w) => {
              const count = bills.filter((b) => {
                const day = getBillDayOfMonth(b.orderDate)
                return day >= w.startDay && day <= w.endDay
              }).length
              const selected = activeWeekId === w.id
              return (
                <button
                  key={w.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setActiveWeekId(selected ? null : w.id)}
                  className={`rt2-focus min-h-[64px] cursor-pointer rounded border-2 p-3 text-left transition ${
                    selected
                      ? "border-[var(--rt-ink)] bg-[var(--rt-ink)] text-[var(--rt-surface)]"
                      : count === 0
                        ? "rt2-btn-secondary opacity-65"
                        : "rt2-btn-secondary"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[15px] font-bold">{w.label}</p>
                    <span className="font-arcade-mono text-[12px] font-semibold opacity-75">
                      {w.range}
                    </span>
                  </div>
                  <p className="font-arcade-mono text-[14px] opacity-85">
                    {count} {count === 1 ? "order" : "orders"}
                  </p>
                </button>
              )
            })}
          </div>

          {filteredBills.length === 0 ? (
            <div className="rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] p-6 text-center text-[15px] text-[var(--rt-muted)]">
              No bills this week.
            </div>
          ) : (
            <div className="divide-y divide-[var(--rt-border-soft)] rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)]">
              {filteredBills.map((bill) => {
                const isCleared = bill.paidCount >= bill.totalPlayers
                const tips = bill.splits.reduce(
                  (s, x) =>
                    s +
                    (x.paidAmount !== null ? x.paidAmount - x.totalOwed : 0),
                  0
                )
                return (
                  <Link
                    key={bill.id}
                    to="/b/$publicId"
                    params={{ publicId: bill.publicId }}
                    className="rt2-focus rt2-row-hover flex min-h-[56px] w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rt2-display rounded border-2 px-2 py-0.5 text-[16px] font-extrabold ${
                          isCleared
                            ? "border-[var(--rt-teal)] text-[var(--rt-teal-ink)]"
                            : "border-[var(--rt-accent)] text-[var(--rt-accent-ink)]"
                        }`}
                      >
                        {isCleared ? "Cleared" : "Open"}
                      </span>
                      <span className="rt2-row-title text-[16px] font-bold">
                        {bill.merchant}
                      </span>
                      <span className="font-arcade-mono text-[14px] text-[var(--rt-muted)]">
                        {fmtDate(bill.orderDate)} ({bill.paidCount} of{" "}
                        {bill.totalPlayers} paid)
                      </span>
                    </div>
                    <div className="tnum flex items-center gap-4 font-arcade-mono text-[16px]">
                      {tips > 0 && (
                        <span className="font-bold text-[var(--rt-teal-ink)]">
                          +{formatRupiah(tips)} tip
                        </span>
                      )}
                      <span className="font-bold">
                        {formatRupiah(bill.finalTotal)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
