import {
  Check,
  MagnifyingGlass,
  UserCheck,
  Warning,
  X,
} from "@phosphor-icons/react"
import { useEffect, useMemo, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatRupiah } from "@/domain/money"
import { getPlayerUnpaidTotal } from "@/domain/types"
import type { PlayerSummary } from "@/domain/types"
import { useAppStore } from "@/lib/app-store"

import { PlayerAvatar } from "./components"
import { ScrollFade } from "./ScrollFade"

function matchesAccountName(
  playerName: string,
  accountName: string | null | undefined
): boolean {
  if (!accountName) return false
  const pNorm = playerName.trim().toLowerCase()
  const aNorm = accountName.trim().toLowerCase()
  if (!pNorm || !aNorm) return false
  if (pNorm === aNorm) return true
  const accountTokens = aNorm.split(/\s+/).filter((t) => t.length >= 2)
  const playerTokens = pNorm.split(/\s+/).filter((t) => t.length >= 2)
  return (
    accountTokens.some((t) => t === pNorm) ||
    playerTokens.some((t) => accountTokens.includes(t))
  )
}

export function IdentifyPlayerDialog() {
  const {
    me,
    players,
    identifyModalOpen,
    dismissIdentifyModal,
    linkMyPlayer,
  } = useAppStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const unlinkedPlayers = useMemo(() => {
    const accountName = me.user?.name
    return players
      .filter((p) => p.archivedAt === null && p.userId === null)
      .sort((a, b) => {
        const aMatch = matchesAccountName(a.name, accountName) ? 0 : 1
        const bMatch = matchesAccountName(b.name, accountName) ? 0 : 1
        if (aMatch !== bMatch) return aMatch - bMatch
        const unpaidDiff = getPlayerUnpaidTotal(b) - getPlayerUnpaidTotal(a)
        if (unpaidDiff !== 0) return unpaidDiff
        return a.name.localeCompare(b.name)
      })
  }, [players, me.user?.name])

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return unlinkedPlayers
    return unlinkedPlayers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q)
    )
  }, [unlinkedPlayers, query])

  const selectedPlayer: PlayerSummary | null = useMemo(
    () => unlinkedPlayers.find((p) => p.id === selectedId) ?? null,
    [unlinkedPlayers, selectedId]
  )

  useEffect(() => {
    if (identifyModalOpen) {
      setSelectedId(null)
      setQuery("")
      setErrorMessage(null)
    }
  }, [identifyModalOpen])

  if (!me.authenticated || me.linkedPlayerId) {
    return null
  }

  const handleConfirm = async () => {
    if (!selectedPlayer || submitting) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      const result = await linkMyPlayer(selectedPlayer.id)
      if (!result.ok) {
        setErrorMessage(result.error ?? "Could not link player.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={identifyModalOpen}
      onOpenChange={(next) => {
        if (!next && !submitting) {
          dismissIdentifyModal()
        }
      }}
    >
      <DialogContent className="max-h-[92dvh] gap-4 overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:max-w-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="rt2-display text-2xl font-extrabold sm:text-3xl">
              Who are you?
            </DialogTitle>
            <DialogDescription className="mt-1 text-[14px] text-[var(--rt-muted)]">
              Signed in as{" "}
              <span className="font-arcade-mono font-semibold text-[var(--rt-ink)]">
                {me.user?.email}
              </span>
              . Pick your player profile so you can report transfers and edit
              your profile without waiting for an admin.
            </DialogDescription>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={dismissIdentifyModal}
            aria-label="Close"
            className="rt2-focus inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] text-[var(--rt-muted)] hover:border-[var(--rt-border)] hover:text-[var(--rt-ink)] disabled:opacity-50"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {unlinkedPlayers.length > 6 && (
          <div className="relative">
            <MagnifyingGlass
              size={16}
              weight="bold"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--rt-muted)]"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your name..."
              aria-label="Search unlinked players"
              className="rt2-focus h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] pr-3 pl-9 text-[14px] font-semibold"
            />
          </div>
        )}

        {unlinkedPlayers.length === 0 ? (
          <div className="rounded border-2 border-dashed border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] p-5 text-center">
            <p className="text-[15px] font-bold">
              No unlinked players available
            </p>
            <p className="mt-1 text-[13px] text-[var(--rt-muted)]">
              Every active player is already linked to an account. Ask an admin
              to add you or update your link.
            </p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="rounded border-2 border-dashed border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] p-5 text-center">
            <p className="text-[14px] font-semibold text-[var(--rt-muted)]">
              No unlinked player matches &ldquo;{query.trim()}&rdquo;.
            </p>
          </div>
        ) : (
          <ScrollFade
            role="radiogroup"
            aria-label="Select your player profile"
            className="grid max-h-[42dvh] grid-cols-1 gap-2 p-0.5 sm:grid-cols-2"
          >
            {filteredPlayers.map((p) => {
              const selected = p.id === selectedId
              const owed = getPlayerUnpaidTotal(p)
              const isMatch = matchesAccountName(p.name, me.user?.name)
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={submitting}
                  onClick={() => {
                    setSelectedId(p.id)
                    setErrorMessage(null)
                  }}
                  className={`rt2-focus flex min-h-[56px] w-full cursor-pointer items-center gap-2.5 rounded border-2 px-3 py-2 text-left transition disabled:opacity-60 ${
                    selected
                      ? "border-[var(--rt-accent)] bg-[var(--rt-accent)] text-[var(--rt-accent-fg)]"
                      : "border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] text-[var(--rt-ink)] hover:border-[var(--rt-border)]"
                  }`}
                >
                  <PlayerAvatar player={p} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-bold">
                        {p.name}
                      </span>
                      {isMatch && (
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 font-arcade-mono text-[10px] leading-none font-bold uppercase ${
                            selected
                              ? "border border-current text-current"
                              : "bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
                          }`}
                        >
                          Match
                        </span>
                      )}
                    </div>
                    <p
                      className={`tnum truncate font-arcade-mono text-[12px] font-semibold ${
                        selected
                          ? "text-current opacity-90"
                          : owed > 0
                            ? "text-[var(--rt-accent-ink)]"
                            : "text-[var(--rt-teal-ink)]"
                      }`}
                    >
                      {owed > 0
                        ? `${formatRupiah(owed)} open`
                        : "All clear"}
                    </p>
                  </div>
                  {selected && (
                    <Check
                      size={16}
                      weight="bold"
                      className="shrink-0 text-current"
                    />
                  )}
                </button>
              )
            })}
          </ScrollFade>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded border border-[var(--rt-accent)] bg-[var(--rt-accent-soft)] px-3 py-2 text-[13px] font-semibold text-[var(--rt-accent-ink)]"
          >
            <Warning size={16} weight="bold" className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--rt-border-soft)] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            disabled={submitting}
            onClick={dismissIdentifyModal}
            className="rt2-focus rt2-btn-secondary inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded px-4 text-[14px] font-bold disabled:opacity-60"
          >
            Not on the list / Skip
          </button>
          {unlinkedPlayers.length > 0 && (
            <button
              type="button"
              disabled={!selectedPlayer || submitting}
              onClick={() => void handleConfirm()}
              className="rt2-focus rt2-btn-primary inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded px-4 text-[14px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserCheck size={16} weight="bold" />
              {submitting
                ? "Linking..."
                : selectedPlayer
                  ? `Confirm: I'm ${selectedPlayer.name}`
                  : "Select your name"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
