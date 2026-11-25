import {
  ArrowCounterClockwise,
  Bank,
  Check,
  DeviceMobile,
  LockSimple,
  PencilSimple,
  Plus,
  QrCode,
  Star,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { AdminShell } from "@/components/admin/AdminShell"
import { SelectMenu } from "@/components/telemetry/components"
import { useAppStore } from "@/lib/app-store"
import type { PaymentMethod, PaymentMethodType } from "@/lib/app-store"

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
})

function MethodIcon({ type }: { type: PaymentMethodType }) {
  if (type === "ewallet") return <DeviceMobile size={16} weight="bold" />
  if (type === "qris") return <QrCode size={16} weight="bold" />
  return <Bank size={16} weight="bold" />
}

function AdminSettingsPage() {
  const {
    paymentMethods,
    addPaymentMethod,
    updatePaymentMethod,
    removePaymentMethod,
    setPrimaryPaymentMethod,
    branding,
    updateBranding,
    resetBranding,
  } = useAppStore()

  // Branding state
  const [brandName, setBrandName] = useState(branding.appName)
  const [brandIcon, setBrandIcon] = useState(branding.iconUrl)

  useEffect(() => {
    setBrandName(branding.appName)
    setBrandIcon(branding.iconUrl)
  }, [branding.appName, branding.iconUrl])

  // New method form state
  const [type, setType] = useState<PaymentMethodType>("bank")
  const [label, setLabel] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [accountHolder, setAccountHolder] = useState("Pajar (Admin)")
  const [note, setNote] = useState("")

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Omit<
    PaymentMethod,
    "id" | "isPrimary"
  > | null>(null)

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!label.trim() || !accountNumber.trim()) return
    addPaymentMethod({
      type,
      label: label.trim(),
      accountNumber: accountNumber.trim(),
      accountHolder: accountHolder.trim() || "Admin",
      note: note.trim(),
    })
    setLabel("")
    setAccountNumber("")
    setNote("")
  }

  const startEdit = (m: PaymentMethod) => {
    setEditingId(m.id)
    setEditDraft({
      type: m.type,
      label: m.label,
      accountNumber: m.accountNumber,
      accountHolder: m.accountHolder,
      note: m.note,
    })
  }

  const saveEdit = (id: string) => {
    if (!editDraft || !editDraft.label.trim() || !editDraft.accountNumber.trim())
      return
    updatePaymentMethod(id, {
      ...editDraft,
      label: editDraft.label.trim(),
      accountNumber: editDraft.accountNumber.trim(),
      accountHolder: editDraft.accountHolder.trim(),
      note: editDraft.note.trim(),
    })
    setEditingId(null)
    setEditDraft(null)
  }

  return (
    <AdminShell
      title="Workspace Settings"
      subtitle="Configure white-label branding and transfer payment methods shown to signed-in players."
    >
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {/* White-label Branding */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateBranding({ appName: brandName, iconUrl: brandIcon })
            }}
            className="space-y-4 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="rt2-display text-2xl font-extrabold">
                  White-label branding
                </h2>
                <p className="mt-0.5 text-[14px] text-[var(--rt-muted)]">
                  Change the workspace title and app icon (also configurable via{" "}
                  <code className="font-arcade-mono text-[12px]">
                    VITE_APP_NAME
                  </code>{" "}
                  and{" "}
                  <code className="font-arcade-mono text-[12px]">
                    VITE_APP_ICON
                  </code>
                  ).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetBranding()
                  setBrandName("Tabquest")
                  setBrandIcon("/icon-512.png")
                }}
                className="rt2-focus rt2-btn-secondary inline-flex min-h-[36px] items-center gap-1 rounded px-3 text-[13px] font-bold"
              >
                <ArrowCounterClockwise size={14} weight="bold" />
                Reset
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <img
                src={brandIcon || "/icon-512.png"}
                alt="App icon preview"
                width={56}
                height={56}
                className="h-14 w-14 shrink-0 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-topbar-bg)] object-cover"
              />
              <div className="min-w-[200px] flex-1">
                <label
                  htmlFor="brand-name"
                  className="block text-[13px] font-bold text-[var(--rt-muted)]"
                >
                  App title
                </label>
                <input
                  id="brand-name"
                  type="text"
                  required
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 text-[15px] font-bold"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2.5">
              <div className="min-w-[200px] flex-1">
                <label
                  htmlFor="brand-icon"
                  className="block text-[13px] font-bold text-[var(--rt-muted)]"
                >
                  Icon path or URL
                </label>
                <input
                  id="brand-icon"
                  type="text"
                  value={brandIcon}
                  onChange={(e) => setBrandIcon(e.target.value)}
                  placeholder="/icon-512.png"
                  className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 font-arcade-mono text-[13px]"
                />
              </div>
              <label className="rt2-focus rt2-btn-secondary inline-flex h-11 cursor-pointer items-center gap-1.5 rounded px-3.5 text-[14px] font-bold">
                <UploadSimple size={15} weight="bold" />
                Upload icon
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      if (typeof reader.result === "string") {
                        setBrandIcon(reader.result)
                      }
                    }
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
              <button
                type="submit"
                className="rt2-focus rt2-btn-primary inline-flex h-11 items-center gap-1.5 rounded px-4 text-[14px] font-bold"
              >
                <Check size={15} weight="bold" />
                Apply branding
              </button>
            </div>
          </form>

          {/* Existing Payment Methods */}
          <section className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
            <h2 className="rt2-display text-2xl font-extrabold">
              Payment methods ({paymentMethods.length})
            </h2>
            <p className="mt-0.5 text-[14px] text-[var(--rt-muted)]">
              Signed-in players can switch between these methods and copy any
              number with one click.
            </p>

            <div className="mt-4 space-y-3">
              {paymentMethods.map((m) => {
                const isEditing = editingId === m.id && editDraft !== null
                return (
                  <div
                    key={m.id}
                    className={`rounded border-2 p-4 ${
                      m.isPrimary
                        ? "border-[var(--rt-accent)] bg-[var(--rt-bg)]"
                        : "border-[var(--rt-ui-border)] bg-[var(--rt-bg)]"
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="mb-1 text-[13px] font-bold text-[var(--rt-muted)]">
                              Type
                            </p>
                            <SelectMenu
                              ariaLabel="Edit payment method type"
                              minWidthClass="w-full"
                              value={editDraft.type}
                              onChange={(v) =>
                                setEditDraft({ ...editDraft, type: v })
                              }
                              options={[
                                { value: "bank", label: "Bank transfer" },
                                { value: "ewallet", label: "E-wallet" },
                                { value: "qris", label: "QRIS" },
                              ]}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-label-${m.id}`}
                              className="block text-[13px] font-bold text-[var(--rt-muted)]"
                            >
                              Bank / wallet name
                            </label>
                            <input
                              id={`edit-label-${m.id}`}
                              type="text"
                              value={editDraft.label}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  label: e.target.value,
                                })
                              }
                              className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] px-3 text-[14px] font-semibold"
                            />
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label
                              htmlFor={`edit-num-${m.id}`}
                              className="block text-[13px] font-bold text-[var(--rt-muted)]"
                            >
                              Account / phone number
                            </label>
                            <input
                              id={`edit-num-${m.id}`}
                              type="text"
                              value={editDraft.accountNumber}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  accountNumber: e.target.value,
                                })
                              }
                              className="rt2-focus tnum mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] px-3 font-arcade-mono text-[14px] font-bold"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`edit-holder-${m.id}`}
                              className="block text-[13px] font-bold text-[var(--rt-muted)]"
                            >
                              Account holder
                            </label>
                            <input
                              id={`edit-holder-${m.id}`}
                              type="text"
                              value={editDraft.accountHolder}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  accountHolder: e.target.value,
                                })
                              }
                              className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] px-3 text-[14px]"
                            />
                          </div>
                        </div>
                        <div>
                          <label
                            htmlFor={`edit-note-${m.id}`}
                            className="block text-[13px] font-bold text-[var(--rt-muted)]"
                          >
                            Note (optional)
                          </label>
                          <input
                            id={`edit-note-${m.id}`}
                            type="text"
                            value={editDraft.note}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                note: e.target.value,
                              })
                            }
                            className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface)] px-3 text-[14px]"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveEdit(m.id)}
                            className="rt2-focus rt2-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded px-4 text-[14px] font-bold"
                          >
                            <Check size={15} weight="bold" />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null)
                              setEditDraft(null)
                            }}
                            className="rt2-focus rt2-btn-secondary inline-flex min-h-[40px] items-center gap-1.5 rounded px-3.5 text-[14px] font-bold"
                          >
                            <X size={15} weight="bold" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[16px] font-bold">
                              <MethodIcon type={m.type} />
                              {m.label}
                            </span>
                            {m.isPrimary && (
                              <span className="inline-flex items-center gap-1 rounded bg-[var(--rt-accent)] px-1.5 py-0.5 font-arcade-mono text-[11px] font-bold text-[var(--rt-accent-fg)]">
                                <Star size={11} weight="fill" />
                                Primary
                              </span>
                            )}
                          </div>
                          <p className="tnum mt-1 font-arcade-mono text-[16px] font-bold">
                            {m.accountNumber}
                          </p>
                          <p className="text-[13px] text-[var(--rt-muted)]">
                            {m.accountHolder}
                            {m.note ? ` | ${m.note}` : ""}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {!m.isPrimary && (
                            <button
                              type="button"
                              onClick={() => setPrimaryPaymentMethod(m.id)}
                              className="rt2-focus rt2-btn-secondary inline-flex min-h-[36px] items-center gap-1 rounded px-2.5 text-[13px] font-bold"
                            >
                              <Star size={13} weight="bold" />
                              Set primary
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => startEdit(m)}
                            className="rt2-focus rt2-btn-secondary inline-flex min-h-[36px] items-center gap-1 rounded px-2.5 text-[13px] font-bold"
                          >
                            <PencilSimple size={13} weight="bold" />
                            Edit
                          </button>
                          {paymentMethods.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Remove ${m.label}`}
                              onClick={() => removePaymentMethod(m.id)}
                              className="rt2-focus rt2-btn-danger inline-flex h-9 w-9 items-center justify-center rounded"
                            >
                              <Trash size={14} weight="bold" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Add New Payment Method Form */}
          <form
            onSubmit={handleAdd}
            className="space-y-4 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5"
          >
            <h2 className="rt2-display text-2xl font-extrabold">
              Add payment method
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[14px] font-bold text-[var(--rt-muted)]">
                  Type
                </p>
                <SelectMenu
                  ariaLabel="Payment method type"
                  minWidthClass="w-full"
                  value={type}
                  onChange={setType}
                  options={[
                    { value: "bank", label: "Bank transfer" },
                    { value: "ewallet", label: "E-wallet" },
                    { value: "qris", label: "QRIS" },
                  ]}
                />
              </div>

              <div>
                <label
                  htmlFor="add-pm-label"
                  className="block text-[14px] font-bold text-[var(--rt-muted)]"
                >
                  Bank / wallet name
                </label>
                <input
                  id="add-pm-label"
                  type="text"
                  required
                  placeholder="e.g. Mandiri, SeaBank, OVO"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 text-[15px] font-semibold"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="add-pm-number"
                  className="block text-[14px] font-bold text-[var(--rt-muted)]"
                >
                  Account / phone number
                </label>
                <input
                  id="add-pm-number"
                  type="text"
                  required
                  placeholder="e.g. 122-00-0987654-3"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="rt2-focus tnum mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 font-arcade-mono text-[15px] font-bold"
                />
              </div>

              <div>
                <label
                  htmlFor="add-pm-holder"
                  className="block text-[14px] font-bold text-[var(--rt-muted)]"
                >
                  Account holder name
                </label>
                <input
                  id="add-pm-holder"
                  type="text"
                  required
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 text-[15px] font-semibold"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="add-pm-note"
                className="block text-[14px] font-bold text-[var(--rt-muted)]"
              >
                Note (optional)
              </label>
              <input
                id="add-pm-note"
                type="text"
                placeholder="e.g. BI-FAST supported, zero fee"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 text-[15px]"
              />
            </div>

            <button
              type="submit"
              className="rt2-focus rt2-btn-primary inline-flex min-h-[46px] items-center gap-2 rounded px-5 text-[15px] font-bold"
            >
              <Plus size={17} weight="bold" />
              Add payment method
            </button>
          </form>
        </div>

        {/* Live Preview */}
        <aside className="space-y-4 lg:col-span-5">
          <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5 lg:sticky lg:top-20">
            <h2 className="rt2-display text-2xl font-extrabold">
              What signed-in players see
            </h2>
            <p className="mt-1 text-[14px] text-[var(--rt-muted)]">
              Live preview of the Pay-All transfer list. Changes update across
              the app immediately.
            </p>

            <div className="mt-4 space-y-2.5">
              {paymentMethods.map((m) => (
                <div
                  key={m.id}
                  className="rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] p-3"
                >
                  <div className="flex items-center justify-between text-[13px] text-[var(--rt-muted)]">
                    <span className="inline-flex items-center gap-1.5 font-bold text-[var(--rt-ink)]">
                      <MethodIcon type={m.type} />
                      {m.label}
                      {m.isPrimary && (
                        <span className="rounded bg-[var(--rt-accent-soft)] px-1.5 py-0.5 font-arcade-mono text-[11px] font-bold text-[var(--rt-accent-ink)]">
                          Primary
                        </span>
                      )}
                    </span>
                    <span className="font-arcade-mono font-bold text-[var(--rt-teal-ink)]">
                      Copy number
                    </span>
                  </div>
                  <p className="tnum mt-1 font-arcade-mono text-[16px] font-bold">
                    {m.accountNumber}
                  </p>
                  <p className="text-[13px] text-[var(--rt-muted)]">
                    {m.accountHolder}
                    {m.note ? ` (${m.note})` : ""}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded border-2 border-dashed border-[var(--rt-ui-border)] bg-[var(--rt-bg)] p-3.5 text-[13px]">
              <div className="flex items-start gap-2">
                <LockSimple
                  size={17}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-[var(--rt-teal-ink)]"
                />
                <p className="text-[var(--rt-muted)]">
                  <strong className="text-[var(--rt-ink)]">
                    Privacy boundary:
                  </strong>{" "}
                  Guests viewing shared bill links never receive any payment
                  method details in HTML or API payloads.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </AdminShell>
  )
}
