import {
  Check,
  Clock,
  Heart,
  Receipt,
  Warning,
  X,
} from "@phosphor-icons/react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"

import { HpBar, PlayerAvatar, fmtDate } from "@/components/telemetry/components"
import { formatRupiah } from "@/domain/money"
import {
  getBillRemainingAmount,
  getPlayerUnpaidTotal,
} from "@/domain/types"
import type { BillSummary } from "@/domain/types"
import { useAppStore } from "@/lib/app-store"

export const Route = createFileRoute("/b/$publicId")({
  component: BillDetailRoute,
})

interface PublicBillDetailPayload {
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
  splitVersion: 1 | 2
}

function BillDetailRoute() {
  const { publicId } = Route.useParams()
  const {
    players,
    me,
    you,
    role,
    preview,
    hit,
    setDrawerOpen,
    toggleBillPlayerPayment,
  } = useAppStore()
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [detail, setDetail] = useState<PublicBillDetailPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const loadBill = async () => {
    try {
      const res = await fetch(
        `/api/public/bills/${encodeURIComponent(publicId)}`
      )
      if (res.status === 404) {
        setNotFound(true)
        setDetail(null)
        return
      }
      if (!res.ok) return
      const data = (await res.json()) as PublicBillDetailPayload
      setDetail(data)
      setNotFound(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void loadBill()
  }, [publicId])

  useEffect(() => {
    if (!receiptOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReceiptOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [receiptOpen])

  const receiptItems = useMemo(() => {
    if (!detail) return []
    return detail.receiptItems.map((it) => ({
      name: it.name,
      qty: it.quantity,
      lineTotal: it.lineTotal,
    }))
  }, [detail])

  if (loading) {
    return (
      <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-10 text-center">
        <p className="rt2-display text-3xl font-extrabold">Loading bill...</p>
      </section>
    )
  }

  if (notFound || !detail) {
    return (
      <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-10 text-center">
        <h1 className="rt2-display text-4xl font-extrabold">Bill not found</h1>
        <p className="mt-2 text-[15px] text-[var(--rt-muted)]">
          This bill may be a draft or no longer exists.
        </p>
        <Link
          to="/"
          className="rt2-focus rt2-btn-primary mt-5 inline-flex min-h-[44px] items-center rounded px-5 text-[15px] font-bold"
        >
          Back to Home
        </Link>
      </section>
    )
  }

  const bill = detail.bill
  const remaining = getBillRemainingAmount(bill)
  const selfPlayer = me.linkedPlayerId
    ? (players.find((p) => p.id === me.linkedPlayerId) ?? null)
    : you
  const youOwed = selfPlayer ? getPlayerUnpaidTotal(selfPlayer) : 0
  const equalFee =
    bill.totalPlayers > 0 ? Math.round(bill.flatFees / bill.totalPlayers) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="rt2-display text-4xl font-extrabold sm:text-5xl">
              {bill.merchant}
            </h1>
            <p className="mt-1 font-arcade-mono text-[15px] text-[var(--rt-muted)]">
              {fmtDate(bill.orderDate)} | Total {formatRupiah(bill.finalTotal)} |{" "}
              {bill.paidCount} of {bill.totalPlayers} paid
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setReceiptOpen(true)}
              className="rt2-focus rt2-btn-secondary inline-flex min-h-[44px] items-center gap-2 rounded px-4 text-[15px] font-bold"
            >
              <Receipt size={18} weight="bold" />
              Receipt photo
            </button>

            {role === "player" && youOwed > 0 && (
              <Link
                to="/"
                className="rt2-focus rt2-btn-primary inline-flex min-h-[44px] items-center rounded px-4 text-[15px] font-bold"
              >
                Pay all my bills ({formatRupiah(youOwed)})
              </Link>
            )}

            {role === "admin" && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="rt2-focus rt2-btn-primary min-h-[44px] rounded px-4 text-[15px] font-bold"
              >
                Open Collect desk
              </button>
            )}
          </div>
      </div>

      {/* 40px Boss Armor HP Bar */}
      <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="rt2-display text-2xl font-extrabold">Boss armor</h2>
          <span className="tnum font-arcade-mono text-[18px] font-bold text-[var(--rt-accent-ink)]">
            Remaining {formatRupiah(remaining)}
          </span>
        </div>
        <HpBar
          bill={bill}
          players={players}
          youId={you?.id ?? ""}
          preview={preview}
          hit={hit}
          tall
          showLegend
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-5">
          <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
            <h2 className="rt2-display text-2xl font-extrabold">
              Receipt summary
            </h2>
            <dl className="mt-4 space-y-2.5 text-[16px]">
              <div className="flex justify-between">
                <dt className="text-[var(--rt-muted)]">Merchant</dt>
                <dd className="font-bold">{bill.merchant}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--rt-muted)]">Order date</dt>
                <dd className="font-arcade-mono">{bill.orderDate}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--rt-muted)]">Items subtotal</dt>
                <dd className="tnum font-arcade-mono text-[17px] font-bold">
                  {formatRupiah(bill.sourceSubtotal)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--rt-muted)]">Voucher discount</dt>
                <dd className="tnum font-arcade-mono text-[17px] font-bold text-[var(--rt-teal-ink)]">
                  {formatRupiah(bill.voucherDiscount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--rt-muted)]">Delivery & service fees</dt>
                <dd className="tnum font-arcade-mono text-[17px] font-bold text-[var(--rt-muted)]">
                  +{formatRupiah(bill.flatFees)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t-2 border-[var(--rt-border)] pt-3">
                <dt className="font-bold">Final total</dt>
                <dd className="rt2-display tnum text-3xl font-extrabold">
                  {formatRupiah(bill.finalTotal)}
                </dd>
              </div>
              <div className="flex justify-between text-[14px] text-[var(--rt-muted)]">
                <dt>Equal fee share</dt>
                <dd className="tnum font-arcade-mono font-bold">
                  {formatRupiah(equalFee)} / player
                </dd>
              </div>
            </dl>
            <p className="mt-4 rounded border border-[var(--rt-border-soft)] bg-[var(--rt-bg)] p-3 text-[14px] text-[var(--rt-muted)]">
              Voucher share is proportional to items; fee share is equal across
              everyone who ordered.
            </p>
          </div>
        </aside>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {bill.splits.map((s) => {
            const player = players.find((p) => p.id === s.playerId)
            const status =
              s.status === "paid"
                ? "paid"
                : player?.pendingClaim
                  ? "pending"
                  : "unpaid"
            const tip =
              s.paidAmount !== null ? Math.max(0, s.paidAmount - s.totalOwed) : 0
            const isSelf =
              me.linkedPlayerId !== null && s.playerId === me.linkedPlayerId
            const isViewing = you !== null && s.playerId === you.id
            const showYouBadge =
              isSelf || (me.linkedPlayerId === null && isViewing)
            const showViewingBadge =
              me.linkedPlayerId !== null && isViewing && !isSelf

            return (
              <article
                key={s.billPlayerId}
                className={`rounded border-2 bg-[var(--rt-surface)] p-4 ${
                  status === "unpaid"
                    ? "border-dashed border-[var(--rt-ui-border)]"
                    : "border-[var(--rt-border)]"
                } ${
                  showYouBadge
                    ? "pl-5 shadow-[inset_4px_0_0_0_var(--rt-accent)]"
                    : showViewingBadge
                      ? "pl-5 shadow-[inset_4px_0_0_0_var(--rt-amber)]"
                      : ""
                }`}
              >
                <Link
                  to="/players/$playerId"
                  params={{ playerId: s.playerId }}
                  className="rt2-focus rt2-row-hover flex min-h-[44px] w-full items-center justify-between gap-2 rounded p-1 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <PlayerAvatar
                      player={
                        player ?? {
                          name: s.name,
                          avatar: s.name.slice(0, 2).toUpperCase(),
                          avatarUrl: null,
                          avatarBanned: false,
                        }
                      }
                      size="md"
                    />
                    <div>
                      <span className="rt2-row-title text-[17px] font-bold">
                        {s.name}
                      </span>
                      {showYouBadge && (
                        <span className="ml-2 rounded bg-[var(--rt-accent-soft)] px-1.5 py-0.5 font-arcade-mono text-[13px] font-bold text-[var(--rt-accent-ink)]">
                          You
                        </span>
                      )}
                      {showViewingBadge && (
                        <span className="ml-2 rounded bg-[var(--rt-amber-soft)] px-1.5 py-0.5 font-arcade-mono text-[13px] font-bold text-[var(--rt-amber-ink)]">
                          Viewing
                        </span>
                      )}
                    </div>
                  </div>
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
                </Link>

                <ul className="mt-3 space-y-1.5 border-t border-[var(--rt-border-soft)] pt-3 text-[15px]">
                  {s.items.map((it) => (
                    <li key={it.name} className="flex justify-between gap-2">
                      <span>
                        {it.qty}x {it.name}
                      </span>
                      <span className="tnum font-arcade-mono">
                        {formatRupiah(it.qty * it.price)}
                      </span>
                    </li>
                  ))}
                  <li className="flex justify-between text-[14px] text-[var(--rt-teal-ink)]">
                    <span>Voucher share</span>
                    <span className="tnum font-arcade-mono font-bold">
                      {formatRupiah(s.discountShare)}
                    </span>
                  </li>
                  <li className="flex justify-between text-[14px] text-[var(--rt-muted)]">
                    <span>Equal fee share</span>
                    <span className="tnum font-arcade-mono">
                      +{formatRupiah(s.feeShare)}
                    </span>
                  </li>
                </ul>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t-2 border-[var(--rt-border)] pt-2.5">
                  <span className="tnum font-arcade-mono text-[18px] font-bold">
                    Owes {formatRupiah(s.totalOwed)}
                  </span>
                  {status === "paid" && tip > 0 && (
                    <span className="tnum inline-flex items-center gap-1 rounded bg-[var(--rt-teal-soft)] px-2 py-0.5 font-arcade-mono text-[14px] font-bold text-[var(--rt-teal-ink)]">
                      <Heart size={14} weight="fill" />+{formatRupiah(tip)} tip
                    </span>
                  )}
                </div>
                {status === "paid" && s.paidAmount !== null && (
                  <p className="tnum mt-1 font-arcade-mono text-[14px] text-[var(--rt-muted)]">
                    Paid {formatRupiah(s.paidAmount)}
                  </p>
                )}
                {role === "admin" && (
                  <div className="mt-2.5 border-t border-[var(--rt-border-soft)] pt-2.5">
                    <button
                      type="button"
                      onClick={async () => {
                        const nextStatus =
                          s.status === "paid" ? "unpaid" : "paid"
                        const ok = await toggleBillPlayerPayment(
                          s.billPlayerId,
                          nextStatus,
                          nextStatus === "paid" ? s.totalOwed : null
                        )
                        if (ok) await loadBill()
                      }}
                      className="rt2-focus rt2-btn-secondary inline-flex min-h-[34px] items-center gap-1.5 rounded px-2.5 text-[12px] font-bold"
                    >
                      {s.status === "paid" ? "Mark unpaid" : "Mark paid"}
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>

      {receiptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Receipt photo"
          onClick={() => setReceiptOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rt2-page-enter w-full max-w-[480px] rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3">
              <h2 className="rt2-display text-2xl font-extrabold">
                Receipt preview
              </h2>
              <button
                type="button"
                aria-label="Close receipt modal"
                onClick={() => setReceiptOpen(false)}
                className="rt2-focus rt2-btn-secondary flex h-11 w-11 items-center justify-center rounded"
              >
                <X size={20} weight="bold" />
              </button>
            </div>

            {bill.receiptUrl ? (
              <div className="max-h-[65vh] overflow-auto rounded border border-[var(--rt-border-soft)] bg-black/5">
                <img
                  src={bill.receiptUrl}
                  alt={`${bill.merchant} receipt`}
                  className="mx-auto w-full object-contain"
                />
              </div>
            ) : (
              <div className="mx-auto max-w-[380px] rotate-[1deg] border-y-4 border-dashed border-[#CBD5E1] bg-white p-5 font-arcade-mono text-[15px] text-[#1A1A1A] shadow-lg">
                <div className="border-b border-dashed border-[#94A3B8] pb-3 text-center">
                  <p className="text-[18px] font-bold">{bill.merchant}</p>
                  <p className="text-[14px] text-[#475569]">{bill.orderDate}</p>
                </div>
                <ul className="my-3 space-y-1.5 border-b border-dashed border-[#94A3B8] pb-3">
                  {receiptItems.map((it) => (
                    <li key={it.name} className="flex justify-between gap-2">
                      <span>
                        {it.qty}x {it.name}
                      </span>
                      <span className="tnum">{formatRupiah(it.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
                <div className="space-y-1 text-[14px]">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="tnum">{formatRupiah(bill.sourceSubtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Voucher</span>
                    <span className="tnum">{formatRupiah(bill.voucherDiscount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fees</span>
                    <span className="tnum">+{formatRupiah(bill.flatFees)}</span>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-[#94A3B8] pt-2 text-[17px] font-bold">
                    <span>TOTAL</span>
                    <span className="tnum">{formatRupiah(bill.finalTotal)}</span>
                  </div>
                </div>
                <p className="mt-4 text-center text-[13px] text-[#475569]">
                  Thank you
                </p>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between text-[14px] text-[var(--rt-muted)]">
              <span>
                {bill.receiptUrl
                  ? "Served from Cloudflare R2"
                  : "No receipt image attached"}
              </span>
              <button
                type="button"
                onClick={() => setReceiptOpen(false)}
                className="rt2-focus rt2-btn-secondary min-h-[44px] rounded px-4 font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
