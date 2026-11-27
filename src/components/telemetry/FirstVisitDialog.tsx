import {
  MagnifyingGlass,
  SignIn,
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

export function FirstVisitDialog() {
  const {
    branding,
    me,
    players,
    authPending,
    signingIn,
    welcomeModalOpen,
    welcomeSimulated,
    dismissWelcomeModal,
    setActivePlayerId,
    handleSignIn,
    pushToast,
  } = useAppStore()

  const [query, setQuery] = useState("")

  const activePlayers = useMemo(() => {
    return players
      .filter((p) => p.archivedAt === null)
      .sort((a, b) => {
        const aHasOpen = a.unpaidBills.length > 0 ? 0 : 1
        const bHasOpen = b.unpaidBills.length > 0 ? 0 : 1
        if (aHasOpen !== bHasOpen) return aHasOpen - bHasOpen
        return a.name.localeCompare(b.name)
      })
  }, [players])

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return activePlayers
    return activePlayers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q)
    )
  }, [activePlayers, query])

  useEffect(() => {
    if (welcomeModalOpen) {
      setQuery("")
    }
  }, [welcomeModalOpen])

  if (!welcomeModalOpen || (!welcomeSimulated && me.authenticated)) {
    return null
  }

  const handleSelectPlayer = (player: PlayerSummary) => {
    setActivePlayerId(player.id)
    dismissWelcomeModal()
    pushToast(`Viewing as ${player.name}.`)
  }

  return (
    <Dialog
      open={welcomeModalOpen}
      disablePointerDismissal
      onOpenChange={() => {
        // Required on first visit: user must sign in or pick a player.
      }}
    >
      <DialogContent className="max-h-[92dvh] gap-4 overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:max-w-lg">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="rt2-display text-2xl font-extrabold sm:text-3xl">
              Who are you?
            </DialogTitle>
            {welcomeSimulated && (
              <span className="rounded bg-[var(--rt-amber-soft)] px-2 py-0.5 font-arcade-mono text-[11px] font-bold text-[var(--rt-amber-ink)] uppercase">
                Dev preview
              </span>
            )}
          </div>
          <DialogDescription className="mt-1 text-[14px] text-[var(--rt-muted)]">
            Welcome to{" "}
            <span className="font-bold text-[var(--rt-ink)]">
              {branding.appName}
            </span>
            . Sign in to link your account and report transfers, or pick your
            name below to jump straight to your bills.
          </DialogDescription>
        </div>

        <button
          type="button"
          disabled={authPending || signingIn}
          onClick={() => void handleSignIn()}
          className="rt2-focus rt2-btn-primary inline-flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded px-4 text-[15px] font-bold disabled:opacity-70"
        >
          <SignIn
            size={18}
            weight="bold"
            className={signingIn ? "animate-pulse" : ""}
          />
          <span>{authPending || signingIn ? "Signing in..." : "Sign in"}</span>
        </button>

        {activePlayers.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--rt-border-soft)]" />
              <span className="font-arcade-mono text-[11px] font-bold tracking-wider text-[var(--rt-muted)] uppercase">
                or pick your name
              </span>
              <span className="h-px flex-1 bg-[var(--rt-border-soft)]" />
            </div>

            {activePlayers.length > 6 && (
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
                  aria-label="Search players"
                  className="rt2-focus h-11 w-full rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] pr-3 pl-9 text-[14px] font-semibold"
                />
              </div>
            )}

            {filteredPlayers.length === 0 ? (
              <div className="rounded border-2 border-dashed border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] p-5 text-center">
                <p className="text-[14px] font-semibold text-[var(--rt-muted)]">
                  No player matches &ldquo;{query.trim()}&rdquo;.
                </p>
              </div>
            ) : (
              <ScrollFade
                role="group"
                aria-label="Pick your player profile"
                className="grid max-h-[38dvh] grid-cols-1 gap-2 p-0.5 sm:grid-cols-2"
              >
                {filteredPlayers.map((p) => {
                  const owed = getPlayerUnpaidTotal(p)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={signingIn}
                      onClick={() => handleSelectPlayer(p)}
                      className="rt2-focus flex min-h-[56px] w-full cursor-pointer items-center gap-2.5 rounded border-2 border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] px-3 py-2 text-left text-[var(--rt-ink)] transition hover:border-[var(--rt-accent)] hover:bg-[var(--rt-accent-soft)] disabled:opacity-60"
                    >
                      <PlayerAvatar player={p} size="sm" />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-bold">
                          {p.name}
                        </span>
                        <span
                          className={`tnum block truncate font-arcade-mono text-[12px] font-semibold ${
                            owed > 0
                              ? "text-[var(--rt-accent-ink)]"
                              : "text-[var(--rt-teal-ink)]"
                          }`}
                        >
                          {owed > 0
                            ? `${formatRupiah(owed)} open`
                            : "All clear"}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </ScrollFade>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
