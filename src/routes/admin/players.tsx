import {
  Archive,
  ArrowCounterClockwise,
  Check,
  Coins,
  DotsThreeVertical,
  EnvelopeSimple,
  LockSimple,
  LockSimpleOpen,
  PencilSimple,
  Plus,
  Prohibit,
  Trash,
  X,
} from "@phosphor-icons/react"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { AdminShell } from "@/components/admin/AdminShell"
import { PlayerAvatar, SegmentedTabs } from "@/components/telemetry/components"
import { useAppStore } from "@/lib/app-store"

export const Route = createFileRoute("/admin/players")({
  component: AdminPlayersPage,
})

type ActionItem = {
  key: string
  icon: React.ReactNode
  label: string
  danger?: boolean
  onSelect: () => void
}

function PlayerActionsMenu({
  label,
  items,
}: {
  label: string
  items: Array<ActionItem | null>
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className="rt2-focus rt2-btn-secondary inline-flex min-h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded"
      >
        <DotsThreeVertical size={18} weight="bold" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1.5">
        {items.map((item) =>
          item ? (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`rt2-focus flex min-h-[38px] w-full cursor-pointer items-center gap-2 rounded px-2.5 text-left text-[14px] font-bold hover:bg-white/10 ${
                item.danger ? "text-[var(--rt-accent-ink)]" : ""
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ) : null
        )}
      </PopoverContent>
    </Popover>
  )
}

function AdminPlayersPage() {
  const {
    adminPlayers,
    adminUsers,
    roundingPlayerId,
    setRoundingPlayerId,
    addPlayer,
    updatePlayer,
    toggleArchivePlayer,
    removePlayerAvatarAdmin,
    setPlayerAvatarBanned,
    setPlayerNameLocked,
  } = useAppStore()

  const [showArchived, setShowArchived] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [newEmail, setNewEmail] = useState("")

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editUserId, setEditUserId] = useState<string>("")
  const [editNameLocked, setEditNameLocked] = useState(false)

  const activePlayers = adminPlayers.filter((p) => p.archivedAt === null)
  const archivedPlayers = adminPlayers.filter((p) => p.archivedAt !== null)
  const visiblePlayers = showArchived ? archivedPlayers : activePlayers

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    const ok = await addPlayer({
      name: newName,
      phone: newPhone.trim() || null,
      email: newEmail.trim() || null,
    })
    if (ok) {
      setNewName("")
      setNewPhone("")
      setNewEmail("")
    }
  }

  const startEdit = (p: (typeof adminPlayers)[number]) => {
    setEditingId(p.id)
    setEditName(p.name)
    setEditEmail(p.email ?? "")
    setEditUserId(p.userId ?? "")
    setEditNameLocked(p.nameLocked)
  }

  const saveEdit = async (playerId: string) => {
    if (!editName.trim()) return
    const ok = await updatePlayer(playerId, {
      name: editName.trim(),
      email: editEmail.trim() || null,
      userId: editUserId || null,
      nameLocked: editNameLocked,
    })
    if (ok) setEditingId(null)
  }

  return (
    <AdminShell
      title="Players & Account Linking"
      subtitle="Pre-link Google emails so players auto-connect on first sign-in, and choose who takes leftover rounding rupiah."
    >
      {/* Add Player Card */}
      <form
        onSubmit={handleAdd}
        className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5"
      >
        <h2 className="rt2-display text-2xl font-extrabold">Add new player</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div>
            <label
              htmlFor="new-player-name"
              className="block text-[13px] font-bold text-[var(--rt-muted)]"
            >
              Display name
            </label>
            <input
              id="new-player-name"
              type="text"
              required
              placeholder="e.g. Arya"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 text-[15px] font-semibold"
            />
          </div>
          <div>
            <label
              htmlFor="new-player-phone"
              className="block text-[13px] font-bold text-[var(--rt-muted)]"
            >
              Phone (optional)
            </label>
            <input
              id="new-player-phone"
              type="text"
              placeholder="0812-..."
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 font-arcade-mono text-[14px] font-semibold"
            />
          </div>
          <div>
            <label
              htmlFor="new-player-email"
              className="block text-[13px] font-bold text-[var(--rt-muted)]"
            >
              Email (pre-link)
            </label>
            <input
              id="new-player-email"
              type="email"
              placeholder="arya@gmail.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rt2-focus mt-1 h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 font-arcade-mono text-[14px]"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="rt2-focus rt2-btn-primary inline-flex h-11 w-full items-center justify-center gap-1.5 rounded px-4 text-[15px] font-bold"
            >
              <Plus size={16} weight="bold" />
              Add player
            </button>
          </div>
        </div>
      </form>

      {/* Roster Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          ariaLabel="Player roster status"
          value={showArchived ? "archived" : "active"}
          onChange={(v) => setShowArchived(v === "archived")}
          options={[
            {
              id: "active",
              label: `Active (${activePlayers.length})`,
            },
            {
              id: "archived",
              label: `Archived (${archivedPlayers.length})`,
            },
          ]}
        />

        <p className="text-[14px] text-[var(--rt-muted)]">
          At most one player can hold the{" "}
          <strong className="text-[var(--rt-ink)]">Takes rounding</strong> flag.
        </p>
      </div>

      {/* Roster List */}
      <section className="divide-y divide-[var(--rt-border-soft)] rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)]">
        {visiblePlayers.length === 0 ? (
          <p className="p-8 text-center text-[15px] text-[var(--rt-muted)]">
            No {showArchived ? "archived" : "active"} players.
          </p>
        ) : (
          visiblePlayers.map((p) => {
            const isRounding = p.id === roundingPlayerId
            const isEditing = editingId === p.id

            return (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                {isEditing ? (
                  <div className="grid w-full gap-2 sm:grid-cols-4 sm:items-center">
                    <input
                      type="text"
                      value={editName}
                      aria-label="Edit player name"
                      onChange={(e) => setEditName(e.target.value)}
                      className="rt2-focus h-10 rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-2.5 text-[14px] font-semibold"
                    />
                    <input
                      type="email"
                      value={editEmail}
                      placeholder="Pre-link email"
                      aria-label="Edit pre-link email"
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="rt2-focus h-10 rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-2.5 font-arcade-mono text-[14px]"
                    />
                    <select
                      value={editUserId}
                      aria-label="Linked account"
                      onChange={(e) => setEditUserId(e.target.value)}
                      className="rt2-focus h-10 rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-2.5 font-arcade-mono text-[13px]"
                    >
                      <option value="">Unlinked account</option>
                      {adminUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.email}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-bold text-[var(--rt-muted)]">
                        <input
                          type="checkbox"
                          checked={editNameLocked}
                          onChange={(e) => setEditNameLocked(e.target.checked)}
                          className="h-4 w-4 cursor-pointer accent-[var(--rt-accent)]"
                        />
                        Force & lock username (prevent user self-edit)
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEdit(p.id)}
                        className="rt2-focus rt2-btn-primary inline-flex h-10 items-center gap-1 rounded px-3 text-[14px] font-bold"
                      >
                        <Check size={15} weight="bold" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rt2-focus rt2-btn-secondary inline-flex h-10 items-center gap-1 rounded px-3 text-[14px] font-bold"
                      >
                        <X size={15} weight="bold" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 items-center gap-3.5">
                      <PlayerAvatar player={p} size="md" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[16px] font-bold">
                            {p.name}
                          </span>
                          <span className="font-arcade-mono text-[14px] text-[var(--rt-muted)]">
                            {p.handle}
                          </span>
                          {isRounding && (
                            <span className="inline-flex items-center gap-1 rounded bg-[var(--rt-teal-soft)] px-2 py-0.5 font-arcade-mono text-[12px] font-bold text-[var(--rt-teal-ink)]">
                              <Coins size={13} weight="bold" />
                              Takes rounding
                            </span>
                          )}
                          {p.avatarBanned && (
                            <span className="inline-flex items-center gap-1 rounded bg-[var(--rt-accent-soft)] px-2 py-0.5 font-arcade-mono text-[12px] font-bold text-[var(--rt-accent-ink)]">
                              <Prohibit size={13} weight="bold" />
                              Avatar banned
                            </span>
                          )}
                          {p.nameLocked && (
                            <span className="inline-flex items-center gap-1 rounded bg-[var(--rt-amber-soft)] px-2 py-0.5 font-arcade-mono text-[12px] font-bold text-[var(--rt-amber-ink)]">
                              <LockSimple size={13} weight="bold" />
                              Name locked
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 flex items-center gap-1.5 font-arcade-mono text-[13px] text-[var(--rt-muted)]">
                          <EnvelopeSimple size={14} weight="bold" />
                          {p.userEmail ? (
                            <span className="text-[var(--rt-teal-ink)]">
                              Linked: {p.userEmail}
                            </span>
                          ) : p.email ? (
                            <span className="text-[var(--rt-amber-ink)]">
                              Pre-linked: {p.email}
                            </span>
                          ) : (
                            <span>Not linked to an account yet</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(p)}
                        className="rt2-focus rt2-btn-secondary inline-flex min-h-[38px] items-center gap-1.5 rounded px-3 text-[13px] font-bold"
                      >
                        <PencilSimple size={14} weight="bold" />
                        Edit
                      </button>
                      <PlayerActionsMenu
                        label={`More actions for ${p.name}`}
                        items={[
                          p.avatarUrl
                            ? {
                                key: "remove-avatar",
                                icon: <Trash size={15} weight="bold" />,
                                label: "Remove avatar",
                                danger: true,
                                onSelect: () =>
                                  void removePlayerAvatarAdmin(p.id),
                              }
                            : null,
                          {
                            key: "ban-avatar",
                            icon: <Prohibit size={15} weight="bold" />,
                            label: p.avatarBanned ? "Unban avatar" : "Ban avatar",
                            onSelect: () =>
                              void setPlayerAvatarBanned(p.id, !p.avatarBanned),
                          },
                          {
                            key: "lock-name",
                            icon: p.nameLocked ? (
                              <LockSimpleOpen size={15} weight="bold" />
                            ) : (
                              <LockSimple size={15} weight="bold" />
                            ),
                            label: p.nameLocked ? "Unlock name" : "Lock name",
                            onSelect: () =>
                              void setPlayerNameLocked(p.id, !p.nameLocked),
                          },
                          !showArchived && !isRounding
                            ? {
                                key: "rounding",
                                icon: <Coins size={15} weight="bold" />,
                                label: "Set rounding",
                                onSelect: () => void setRoundingPlayerId(p.id),
                              }
                            : null,
                          {
                            key: "archive",
                            icon: showArchived ? (
                              <ArrowCounterClockwise size={15} weight="bold" />
                            ) : (
                              <Archive size={15} weight="bold" />
                            ),
                            label: showArchived ? "Restore" : "Archive",
                            onSelect: () =>
                              void toggleArchivePlayer(p.id, !showArchived),
                          },
                        ]}
                      />
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </section>
    </AdminShell>
  )
}
