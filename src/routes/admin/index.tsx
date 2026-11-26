import {
  Archive,
  ArrowCounterClockwise,
  CaretRight,
  MagnifyingGlass,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import { AdminShell } from "@/components/admin/AdminShell"
import { SegmentedTabs, fmtDate } from "@/components/telemetry/components"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatRupiah } from "@/domain/money"
import {
  getBillRemainingAmount,
  getPlayerUnpaidTotal,
} from "@/domain/types"
import { useAppStore } from "@/lib/app-store"

export const Route = createFileRoute("/admin/")({
  component: AdminBillsPage,
})

function AdminBillsPage() {
  const {
    players,
    activeAdminBills,
    draftBills,
    archivedBills,
    publishDraftBill,
    toggleArchiveBill,
    deleteDraftBill,
    setDrawerOpen,
  } = useAppStore()

  const [tab, setTab] = useState<"active" | "drafts" | "archived">("active")
  const [query, setQuery] = useState("")
  const [pendingDelete, setPendingDelete] = useState<{
    id: string
    merchant: string
  } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openDebtors = players.filter((p) => p.unpaidBills.length > 0)
  const pendingClaims = openDebtors.filter((p) => p.pendingClaim !== null)
  const totalOutstanding = openDebtors.reduce(
    (sum, p) => sum + getPlayerUnpaidTotal(p),
    0
  )

  const activeBills = activeAdminBills
  const unpaidActiveCount = activeBills.filter(
    (b) => b.paidCount < b.totalPlayers
  ).length

  const listByTab =
    tab === "active"
      ? activeBills
      : tab === "drafts"
        ? draftBills
        : archivedBills

  const q = query.trim().toLowerCase()
  const visibleBills = q
    ? listByTab.filter(
        (b) =>
          b.merchant.toLowerCase().includes(q) ||
          b.publicId.toLowerCase().includes(q)
      )
    : listByTab

  return (
    <AdminShell
      title="Admin Bills"
      subtitle="Create group-order bills, publish drafts, and reconcile incoming transfers."
      action={
        <Link
          to="/admin/bills/new"
          className="rt2-focus rt2-btn-primary inline-flex min-h-[44px] items-center gap-2 rounded px-4 text-[15px] font-bold"
        >
          <Plus size={18} weight="bold" />
          New bill
        </Link>
      }
    >
      {/* KPI Strip */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4">
          <p className="text-[14px] font-bold text-[var(--rt-muted)]">
            Open balance
          </p>
          <p className="tnum mt-1 font-arcade-mono text-2xl font-bold text-[var(--rt-accent-ink)]">
            {formatRupiah(totalOutstanding)}
          </p>
          <p className="mt-1 text-[14px] text-[var(--rt-muted)]">
            Across {openDebtors.length} players
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rt2-focus rt2-row-hover rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4 text-left"
        >
          <p className="text-[14px] font-bold text-[var(--rt-muted)]">
            Pending claims
          </p>
          <p className="tnum mt-1 font-arcade-mono text-2xl font-bold text-[var(--rt-amber-ink)]">
            {pendingClaims.length} waiting
          </p>
          <p className="mt-1 text-[14px] font-semibold text-[var(--rt-accent-ink)]">
            Open Collect drawer
          </p>
        </button>

        <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4">
          <p className="text-[14px] font-bold text-[var(--rt-muted)]">
            Active bills
          </p>
          <p className="tnum mt-1 font-arcade-mono text-2xl font-bold">
            {unpaidActiveCount} open
          </p>
          <p className="mt-1 text-[14px] text-[var(--rt-muted)]">
            {activeBills.length} total published
          </p>
        </div>

        <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-4">
          <p className="text-[14px] font-bold text-[var(--rt-muted)]">
            Saved drafts
          </p>
          <p className="tnum mt-1 font-arcade-mono text-2xl font-bold text-[var(--rt-teal-ink)]">
            {draftBills.length} ready
          </p>
          <p className="mt-1 text-[14px] text-[var(--rt-muted)]">
            Not visible to players yet
          </p>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-3">
        <SegmentedTabs
          ariaLabel="Bill status filter"
          value={tab}
          onChange={setTab}
          options={[
            { id: "active", label: `Active (${activeBills.length})` },
            { id: "drafts", label: `Drafts (${draftBills.length})` },
            { id: "archived", label: `Archived (${archivedBills.length})` },
          ]}
        />

        <div className="rt2-search-box relative flex h-11 w-full max-w-xs items-center rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)]">
          <MagnifyingGlass
            size={17}
            className="rt2-search-icon ml-3 shrink-0 text-[var(--rt-muted)]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter merchant..."
            aria-label="Filter bills by merchant"
            className="h-full w-full bg-transparent px-2.5 text-[14px] text-[var(--rt-ink)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="rt2-focus flex h-10 w-10 cursor-pointer items-center justify-center text-[var(--rt-muted)] hover:text-[var(--rt-ink)]"
            >
              <X size={15} weight="bold" />
            </button>
          )}
        </div>
      </section>

      {/* Bills List */}
      <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)]">
        {visibleBills.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[16px] font-bold">
              No {tab} bills{q ? ` matching "${query}"` : ""}.
            </p>
            <p className="mt-1 text-[14px] text-[var(--rt-muted)]">
              {tab === "drafts"
                ? "Create a new bill and save it as a draft to review it later."
                : tab === "archived"
                  ? "Archived bills appear here and can be restored anytime."
                  : "Start a new group order to track splits."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--rt-border-soft)]">
            {visibleBills.map((bill) => {
              const remaining = getBillRemainingAmount(bill)
              const paidPct =
                bill.finalTotal > 0
                  ? Math.round(
                      ((bill.finalTotal - remaining) / bill.finalTotal) * 100
                    )
                  : 100
              const isCleared = bill.paidCount >= bill.totalPlayers

              return (
                <div
                  key={bill.id}
                  className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={`rt2-display rounded border-2 px-2 py-0.5 text-[15px] font-extrabold ${
                          tab === "drafts"
                            ? "border-[var(--rt-amber)] text-[var(--rt-amber-ink)]"
                            : isCleared
                              ? "border-[var(--rt-teal)] text-[var(--rt-teal-ink)]"
                              : "border-[var(--rt-accent)] text-[var(--rt-accent-ink)]"
                        }`}
                      >
                        {tab === "drafts"
                          ? "Draft"
                          : isCleared
                            ? "Cleared"
                            : "Open"}
                      </span>
                      <h2 className="truncate text-[17px] font-bold">
                        {bill.merchant}
                      </h2>
                      <span className="font-arcade-mono text-[13px] text-[var(--rt-muted)]">
                        {fmtDate(bill.orderDate)}
                      </span>
                    </div>
                    <p className="mt-1 font-arcade-mono text-[14px] text-[var(--rt-muted)]">
                      {bill.paidCount} of {bill.totalPlayers} paid | Total{" "}
                      <strong className="tnum text-[var(--rt-ink)]">
                        {formatRupiah(bill.finalTotal)}
                      </strong>
                      {remaining > 0 && tab !== "drafts" && (
                        <>
                          {" "}
                          | Remaining{" "}
                          <strong className="tnum text-[var(--rt-accent-ink)]">
                            {formatRupiah(remaining)}
                          </strong>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Compact HP progress bar */}
                  <div>
                    <div className="flex justify-between font-arcade-mono text-[12px] font-semibold text-[var(--rt-muted)]">
                      <span>HP cleared</span>
                      <span className="tnum">{paidPct}%</span>
                    </div>
                    <div className="mt-1 h-2.5 w-full overflow-hidden rounded-sm border border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)]">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${paidPct}%`,
                          backgroundColor:
                            paidPct >= 100
                              ? "var(--rt-chunk-paid)"
                              : "var(--rt-accent)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {tab === "drafts" ? (
                      <>
                        <Link
                          to="/admin/bills/$billId/edit"
                          params={{ billId: bill.id }}
                          className="rt2-focus rt2-btn-secondary inline-flex min-h-[40px] items-center gap-1.5 rounded px-3 text-[14px] font-bold"
                        >
                          <PencilSimple size={15} weight="bold" />
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => void publishDraftBill(bill.id)}
                          className="rt2-focus rt2-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded px-3.5 text-[14px] font-bold"
                        >
                          <PaperPlaneTilt size={15} weight="bold" />
                          Publish
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete draft ${bill.merchant}`}
                          onClick={() =>
                            setPendingDelete({ id: bill.id, merchant: bill.merchant })
                          }
                          className="rt2-focus rt2-btn-danger inline-flex min-h-[40px] items-center gap-1 rounded px-3 text-[14px] font-bold"
                        >
                          <Trash size={15} weight="bold" />
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <Link
                          to="/b/$publicId"
                          params={{ publicId: bill.publicId }}
                          className="rt2-focus rt2-btn-secondary inline-flex min-h-[40px] items-center gap-1 rounded px-3 text-[14px] font-bold"
                        >
                          View
                          <CaretRight size={14} weight="bold" />
                        </Link>
                        <Link
                          to="/admin/bills/$billId/edit"
                          params={{ billId: bill.id }}
                          className="rt2-focus rt2-btn-secondary inline-flex min-h-[40px] items-center gap-1.5 rounded px-3 text-[14px] font-bold"
                        >
                          <PencilSimple size={15} weight="bold" />
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() =>
                            void toggleArchiveBill(bill.id, tab !== "archived")
                          }
                          className="rt2-focus rt2-btn-secondary inline-flex min-h-[40px] items-center gap-1.5 rounded px-3 text-[14px] font-bold"
                        >
                          {tab === "archived" ? (
                            <>
                              <ArrowCounterClockwise size={15} weight="bold" />
                              Restore
                            </>
                          ) : (
                            <>
                              <Archive size={15} weight="bold" />
                              Archive
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this draft?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.merchant} and its items, players and receipt will
              be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-2">
            <DialogClose
              disabled={deleting}
              className="rt2-focus rt2-btn-secondary min-h-[42px] rounded px-4 text-[14px] font-bold"
            >
              Keep draft
            </DialogClose>
            <button
              type="button"
              disabled={deleting}
              onClick={async () => {
                if (!pendingDelete) return
                setDeleting(true)
                try {
                  await deleteDraftBill(pendingDelete.id)
                } finally {
                  setDeleting(false)
                  setPendingDelete(null)
                }
              }}
              className="rt2-focus rt2-btn-danger inline-flex min-h-[42px] items-center gap-1.5 rounded px-4 text-[14px] font-bold"
            >
              <Trash size={15} weight="bold" />
              {deleting ? "Deleting..." : "Delete draft"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
