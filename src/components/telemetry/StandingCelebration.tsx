import {
  Crown,
  Flame,
  Heart,
  Trophy,
  X,
} from "@phosphor-icons/react"
import type { CSSProperties } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { PlayerAvatar } from "@/components/telemetry/components"
import { formatRupiah } from "@/domain/money"
import type { StandingChangeSummary, StandingMove } from "@/domain/types"
import { useAppStore } from "@/lib/app-store"

const CARD_HEIGHT = 76
const CARD_GAP = 12
const CARD_STRIDE = CARD_HEIGHT + CARD_GAP

const CARD_CONFETTI: Array<{
  left: string
  top: string
  cx: string
  cy: string
  cr: string
  delay: string
  color: string
  size: string
}> = [
  { left: "12%", top: "20%", cx: "-56px", cy: "-54px", cr: "-170deg", delay: "0ms", color: "bg-[#F5C32E]", size: "h-2 w-3" },
  { left: "22%", top: "10%", cx: "-34px", cy: "-72px", cr: "145deg", delay: "40ms", color: "bg-[#22C3B8]", size: "h-2 w-2" },
  { left: "36%", top: "6%", cx: "-18px", cy: "-78px", cr: "-120deg", delay: "80ms", color: "bg-[#FF6B35]", size: "h-1.5 w-3" },
  { left: "50%", top: "4%", cx: "4px", cy: "-82px", cr: "190deg", delay: "30ms", color: "bg-[#F7F4EC]", size: "h-2 w-2" },
  { left: "64%", top: "8%", cx: "24px", cy: "-74px", cr: "-150deg", delay: "60ms", color: "bg-[#F5C32E]", size: "h-2 w-3" },
  { left: "78%", top: "12%", cx: "42px", cy: "-68px", cr: "160deg", delay: "20ms", color: "bg-[#22C3B8]", size: "h-1.5 w-3" },
  { left: "88%", top: "22%", cx: "58px", cy: "-50px", cr: "-180deg", delay: "90ms", color: "bg-[#FF6B35]", size: "h-2 w-2" },
  { left: "6%", top: "55%", cx: "-68px", cy: "-18px", cr: "-130deg", delay: "50ms", color: "bg-[#22C3B8]", size: "h-2 w-2.5" },
  { left: "94%", top: "55%", cx: "68px", cy: "-16px", cr: "140deg", delay: "70ms", color: "bg-[#F5C32E]", size: "h-2 w-2.5" },
  { left: "18%", top: "82%", cx: "-48px", cy: "32px", cr: "110deg", delay: "110ms", color: "bg-[#FF6B35]", size: "h-1.5 w-2.5" },
  { left: "44%", top: "88%", cx: "-12px", cy: "38px", cr: "-95deg", delay: "95ms", color: "bg-[#F7F4EC]", size: "h-2 w-2" },
  { left: "76%", top: "84%", cx: "46px", cy: "34px", cr: "135deg", delay: "85ms", color: "bg-[#22C3B8]", size: "h-1.5 w-2.5" },
]

type OverlayPhase = "hold" | "vibrate" | "swap" | "done"

function boardLabel(board: StandingChangeSummary["board"]): string {
  return board === "tips" ? "Tip Rank" : "Spending Rank"
}

function buildHeadline(
  change: StandingChangeSummary,
  currentPlayerId: string | null,
  diffAmount: number
): {
  badgeLabel: string
  title: string
  subtitle: string
  passingLine: string
  passingDiff: string
} {
  const isActorMe = currentPlayerId !== null && change.actorId === currentPlayerId
  const isTargetMe =
    currentPlayerId !== null && change.targetId === currentPlayerId
  const board = boardLabel(change.board)
  const boardShort = change.board === "tips" ? "Tips" : "Spending"
  const actorLabel = isActorMe ? "You" : change.actorName
  const targetLabel = isTargetMe ? "you" : (change.targetName ?? `#${change.newRank}`)

  if (change.kind === "crown") {
    const leadText =
      diffAmount > 0
        ? `leading by ${formatRupiah(diffAmount)}`
        : "claiming the top spot"
    return {
      badgeLabel: `${board} crown`,
      title: isActorMe
        ? `You took #1 in ${board}!`
        : `${change.actorName} took #1 in ${board}!`,
      subtitle: `${change.triggerLabel} (${change.monthLabel}), ${leadText}.`,
      passingLine: `${actorLabel} passed ${targetLabel} to #1 in ${boardShort}`,
      passingDiff:
        diffAmount > 0
          ? `Ahead by ${formatRupiah(diffAmount)}`
          : `Tied at ${formatRupiah(change.amount)}`,
    }
  }

  if (change.kind === "close-chase") {
    return {
      badgeLabel: `${board} chase`,
      title: isActorMe
        ? `You are closing in on #1!`
        : `${change.actorName} is closing in on #1!`,
      subtitle: `${change.triggerLabel} (${change.monthLabel}), only ${formatRupiah(change.gapAmount)} behind.`,
      passingLine: `${actorLabel} is closing in on ${targetLabel} in ${boardShort}`,
      passingDiff: `${formatRupiah(change.gapAmount)} behind #1`,
    }
  }

  const fromText = change.prevRank ? `from #${change.prevRank} ` : ""
  return {
    badgeLabel: `${board} shift`,
    title: isActorMe
      ? `You climbed to #${change.newRank} in ${board}!`
      : `${change.actorName} climbed ${fromText}to #${change.newRank}!`,
    subtitle: `${change.triggerLabel} (${change.monthLabel}).`,
    passingLine: `${actorLabel} passed ${targetLabel} to #${change.newRank} in ${boardShort}`,
    passingDiff:
      diffAmount > 0
        ? `Ahead by ${formatRupiah(diffAmount)}`
        : `Tied at ${formatRupiah(change.amount)}`,
  }
}

function pickContestants(change: StandingChangeSummary): {
  top: StandingMove
  bottom: StandingMove
} {
  const actorMove =
    change.moves.find((m) => m.playerId === change.actorId) ?? {
      playerId: change.actorId,
      name: change.actorName,
      prevRank: change.prevRank,
      newRank: change.newRank,
      prevAmount: Math.max(0, change.amount - change.gapAmount),
      newAmount: change.amount,
    }

  const targetMove =
    (change.targetId
      ? change.moves.find((m) => m.playerId === change.targetId)
      : null) ??
    change.moves.find((m) => m.playerId !== change.actorId) ?? {
      playerId: change.targetId ?? "previous-holder",
      name: change.targetName ?? "Previous holder",
      prevRank: change.newRank,
      newRank: change.kind === "close-chase" ? 1 : change.newRank + 1,
      prevAmount: Math.max(0, change.amount - change.gapAmount),
      newAmount: Math.max(0, change.amount - change.gapAmount),
    }

  return { top: targetMove, bottom: actorMove }
}

/**
 * Compact button on Home and Ranks that lets anyone view or replay the
 * latest standing shift on demand.
 */
export function StandingShiftButton({ className = "" }: { className?: string }) {
  const { latestStandingChange, hasUnseenStandingChange, openStandingModal } =
    useAppStore()

  if (!latestStandingChange) return null

  return (
    <button
      type="button"
      onClick={openStandingModal}
      aria-label="View latest standing changes"
      className={`rt2-focus rt2-btn-secondary relative inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded px-3 text-[13px] font-bold sm:text-[14px] ${className}`.trim()}
    >
      {latestStandingChange.kind === "crown" ? (
        <Crown
          size={15}
          weight="fill"
          className="shrink-0 text-[var(--rt-amber-ink)]"
        />
      ) : latestStandingChange.kind === "close-chase" ? (
        <Flame
          size={15}
          weight="fill"
          className="shrink-0 text-[var(--rt-accent-ink)]"
        />
      ) : (
        <Trophy
          size={15}
          weight="fill"
          className="shrink-0 text-[var(--rt-teal-ink)]"
        />
      )}
      <span>Standings shift</span>
      {hasUnseenStandingChange && (
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full bg-[var(--rt-accent)]"
        />
      )}
    </button>
  )
}

function EventEmblem({ change }: { change: StandingChangeSummary }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-[var(--rt-border-soft)] bg-[var(--rt-bg)]">
      {change.stickerSrc && change.kind === "crown" ? (
        <img
          src={change.stickerSrc}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 object-contain"
        />
      ) : change.kind === "crown" ? (
        <Crown
          size={20}
          weight="fill"
          className="text-[var(--rt-amber-ink)]"
        />
      ) : change.kind === "close-chase" ? (
        <Flame
          size={20}
          weight="fill"
          className="text-[var(--rt-accent-ink)]"
        />
      ) : change.board === "tips" ? (
        <Heart
          size={20}
          weight="fill"
          className="text-[var(--rt-teal-ink)]"
        />
      ) : (
        <Trophy
          size={20}
          weight="fill"
          className="text-[var(--rt-teal-ink)]"
        />
      )}
    </div>
  )
}

/**
 * Non-blocking celebratory chamfered card shown once per unseen notable
 * standing change + fullscreen overlay animation (hold 1s -> vibrate top ->
 * animate top down -> reveal passing text). Click once to skip, click again
 * on the overlay to close.
 */
export function StandingCelebration() {
  const {
    players,
    you,
    me,
    latestStandingChange,
    standingBannerOpen,
    standingModalOpen,
    dismissStandingBanner,
    openStandingModal,
    closeStandingModal,
  } = useAppStore()
  const [bannerHovered, setBannerHovered] = useState(false)
  const [phase, setPhase] = useState<OverlayPhase>("hold")
  const [skipped, setSkipped] = useState(false)
  const timersRef = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id)
    }
    timersRef.current = []
  }, [])

  // Gently auto-dismiss the non-blocking banner after 10s unless hovered
  useEffect(() => {
    if (!standingBannerOpen || bannerHovered) return
    const timer = window.setTimeout(() => {
      dismissStandingBanner()
    }, 10000)
    return () => window.clearTimeout(timer)
  }, [standingBannerOpen, bannerHovered, dismissStandingBanner])

  // Drive the 4-phase overlay choreography: 1s hold -> vibrate top -> swap -> done
  useEffect(() => {
    clearTimers()
    if (!standingModalOpen || !latestStandingChange) return

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) {
      setSkipped(true)
      setPhase("done")
      return
    }

    setSkipped(false)
    setPhase("hold")

    const t1 = window.setTimeout(() => setPhase("vibrate"), 1000)
    const t2 = window.setTimeout(() => setPhase("swap"), 1500)
    const t3 = window.setTimeout(() => setPhase("done"), 2250)
    timersRef.current = [t1, t2, t3]

    return clearTimers
  }, [standingModalOpen, latestStandingChange?.id, clearTimers])

  // Keyboard support: Escape closes, Space/Enter skips or closes
  useEffect(() => {
    if (!standingModalOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearTimers()
        closeStandingModal()
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        if (phase !== "done") {
          clearTimers()
          setSkipped(true)
          setPhase("done")
        } else {
          closeStandingModal()
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [standingModalOpen, phase, clearTimers, closeStandingModal])

  const contestants = useMemo(
    () => (latestStandingChange ? pickContestants(latestStandingChange) : null),
    [latestStandingChange]
  )

  if (!latestStandingChange || !contestants) return null

  const currentPlayerId =
    (me.authenticated ? me.linkedPlayerId : null) || you?.id || null
  const diffAmount = Math.max(
    0,
    contestants.bottom.newAmount - contestants.top.newAmount
  )
  const copy = buildHeadline(latestStandingChange, currentPlayerId, diffAmount)
  const playerById = new Map(players.map((p) => [p.id, p]))
  const frameTone =
    latestStandingChange.kind === "crown"
      ? "bg-[var(--rt-amber)]"
      : latestStandingChange.kind === "close-chase"
        ? "bg-[var(--rt-accent)]"
        : "bg-[var(--rt-teal)]"

  const handleOverlayClick = () => {
    if (phase !== "done") {
      clearTimers()
      setSkipped(true)
      setPhase("done")
      return
    }
    closeStandingModal()
  }

  const isSwapped = phase === "swap" || phase === "done"
  const isCloseChase = latestStandingChange.kind === "close-chase"
  const stageHeight = CARD_HEIGHT * 2 + CARD_GAP

  const topTranslateY = isSwapped && !isCloseChase ? CARD_STRIDE : 0
  const bottomTranslateY = isSwapped
    ? isCloseChase
      ? CARD_STRIDE - 10
      : 0
    : CARD_STRIDE

  const renderContestantCard = (
    contestant: StandingMove,
    role: "top" | "bottom"
  ) => {
    const p = playerById.get(contestant.playerId)
    const isMe =
      currentPlayerId !== null && contestant.playerId === currentPlayerId
    const isVibrating = role === "top" && phase === "vibrate"
    const shownRank = isSwapped ? contestant.newRank : contestant.prevRank
    const shownAmount = isSwapped ? contestant.newAmount : contestant.prevAmount
    const y = role === "top" ? topTranslateY : bottomTranslateY
    const isWinnerAfter = isSwapped && role === "bottom"
    const isDroppedAfter = isSwapped && !isCloseChase && role === "top"
    const showConfetti = phase === "done" && role === "bottom" && !skipped

    return (
      <div
        key={contestant.playerId}
        style={{
          height: `${CARD_HEIGHT}px`,
          transform: `translateY(${y}px)`,
          zIndex: role === "bottom" ? (isSwapped ? 20 : 10) : isSwapped ? 10 : 20,
          transitionDuration: skipped ? "0ms" : undefined,
        }}
        className="rt2-swap-row absolute right-0 left-0"
      >
        {showConfetti &&
          CARD_CONFETTI.map((piece, idx) => (
            <span
              key={idx}
              aria-hidden="true"
              style={
                {
                  left: piece.left,
                  top: piece.top,
                  "--cx": piece.cx,
                  "--cy": piece.cy,
                  "--cr": piece.cr,
                  animationDelay: piece.delay,
                } as CSSProperties
              }
              className={`rt2-confetti-piece pointer-events-none absolute z-30 rounded-[1px] ${piece.size} ${piece.color}`}
            />
          ))}
        <div
          className={`flex h-full items-center justify-between gap-3 rounded border-2 px-4 shadow-xl transition-[opacity,filter,transform,border-color] duration-500 ${
            isVibrating ? "rt2-vibrate" : ""
          } ${showConfetti ? "rt2-winner-pulse" : ""} ${
            isWinnerAfter
              ? "border-[var(--rt-teal)] bg-[var(--rt-surface)]"
              : isDroppedAfter
                ? "scale-[0.98] border-[var(--rt-ui-border)] bg-[var(--rt-surface)] opacity-60 saturate-50"
                : "border-[var(--rt-border)] bg-[var(--rt-surface)]"
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded font-arcade-mono text-[14px] font-extrabold ${
                isSwapped && shownRank === 1
                  ? "bg-[var(--rt-amber-soft)] text-[var(--rt-amber-ink)]"
                  : isWinnerAfter
                    ? "bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
                    : "bg-[var(--rt-bg)] text-[var(--rt-muted)]"
              }`}
            >
              {shownRank === 1 ? (
                <Crown size={17} weight="fill" />
              ) : shownRank !== null ? (
                `#${shownRank}`
              ) : (
                "New"
              )}
            </span>

            <PlayerAvatar
              player={
                p ?? {
                  name: contestant.name,
                  avatar: contestant.name.slice(0, 2).toUpperCase(),
                  avatarUrl: null,
                  avatarBanned: false,
                }
              }
              size="md"
            />

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-[16px] font-bold text-[var(--rt-ink)]">
                  {contestant.name}
                </span>
                {isMe && (
                  <span className="rounded bg-[var(--rt-accent)] px-1.5 py-0.5 font-arcade-mono text-[10px] font-bold text-[var(--rt-accent-fg)]">
                    You
                  </span>
                )}
              </div>
              <p className="tnum font-arcade-mono text-[13px] font-bold text-[var(--rt-muted)]">
                {latestStandingChange.board === "tips" ? "+" : ""}
                {formatRupiah(shownAmount)}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {standingBannerOpen && (
        <aside
          role="status"
          aria-label="Standings update"
          onMouseEnter={() => setBannerHovered(true)}
          onMouseLeave={() => setBannerHovered(false)}
          className={`rt2-celebrate-in rt2-chamfer-frame fixed inset-x-3 bottom-4 z-[90] mx-auto w-auto max-w-md shadow-2xl sm:inset-x-auto sm:left-4 sm:mx-0 ${frameTone}`}
        >
          <div className="rt2-chamfer-inner relative overflow-hidden bg-[var(--rt-surface)] p-3.5 text-[var(--rt-ink)]">
            <div className="flex items-start gap-3">
              <EventEmblem change={latestStandingChange} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-arcade-mono text-[12px] font-bold text-[var(--rt-muted)]">
                    {copy.badgeLabel}
                  </span>
                  <span className="rt2-rank-flip inline-flex items-center gap-0.5 rounded bg-[var(--rt-teal-soft)] px-1.5 py-0.5 font-arcade-mono text-[11px] font-bold text-[var(--rt-teal-ink)]">
                    {latestStandingChange.prevRank
                      ? `#${latestStandingChange.prevRank} to #${latestStandingChange.newRank}`
                      : `#${latestStandingChange.newRank}`}
                  </span>
                </div>
                <p className="mt-0.5 text-[15px] leading-snug font-extrabold">
                  {copy.title}
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--rt-muted)]">
                  {copy.subtitle}
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openStandingModal}
                    className="rt2-focus rt2-btn-primary inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded px-3 text-[13px] font-bold"
                  >
                    Watch shift
                  </button>
                  <button
                    type="button"
                    onClick={dismissStandingBanner}
                    className="rt2-focus rt2-btn-secondary inline-flex min-h-[34px] cursor-pointer items-center rounded px-2.5 text-[13px] font-bold"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={dismissStandingBanner}
                aria-label="Dismiss standings update"
                className="rt2-focus -mt-1 -mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--rt-muted)] hover:bg-[var(--rt-bg)] hover:text-[var(--rt-ink)]"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <div
              aria-hidden="true"
              style={{
                animationPlayState: bannerHovered ? "paused" : "running",
              }}
              className={`rt2-drain-bar absolute right-0 bottom-0 left-0 h-[3px] ${frameTone}`}
            />
          </div>
        </aside>
      )}

      {standingModalOpen && (
        <div
          role="presentation"
          onClick={handleOverlayClick}
          className="rt2-overlay-in fixed inset-0 z-[95] flex cursor-pointer flex-col items-center justify-center bg-black/70 px-4 backdrop-blur-[2px] select-none"
        >
          <div className="w-full max-w-md space-y-5">
            <div
              style={{ height: `${stageHeight}px` }}
              className="relative w-full"
            >
              {renderContestantCard(contestants.top, "top")}
              {renderContestantCard(contestants.bottom, "bottom")}
            </div>

            <div className="text-center">
              <div
                aria-hidden={phase !== "done"}
                className={`space-y-1.5 ${
                  skipped
                    ? "transition-none"
                    : "transition-[opacity,transform] duration-420 ease-[cubic-bezier(0.22,1,0.36,1)]"
                } ${
                  phase === "done"
                    ? "translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none translate-y-3 scale-[0.97] opacity-0"
                }`}
              >
                <p className="font-ui-sans text-xl leading-snug font-extrabold tracking-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.9),0_0_24px_rgba(0,0,0,0.65)] sm:text-2xl">
                  {copy.passingLine}
                </p>
                <p className="tnum font-arcade-mono text-[15px] font-bold text-[#5CE6DD] [text-shadow:0_2px_10px_rgba(0,0,0,0.95),0_0_18px_rgba(0,0,0,0.7)]">
                  {copy.passingDiff}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
