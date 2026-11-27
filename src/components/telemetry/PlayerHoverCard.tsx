import { Crown, Heart } from "@phosphor-icons/react"
import { useRef, useState } from "react"
import type { ReactNode } from "react"

import { BadgeIcon, PlayerAvatar, TierPill } from "@/components/telemetry/components"
import { formatRupiah } from "@/domain/money"
import {
  getPlayerUnpaidTotal,
  getSpendingLeaderboard,
  getTipLeaderboard,
  tierForSpend,
} from "@/domain/types"
import type { PlayerMonthlyBadge, PlayerSummary } from "@/domain/types"
import { useAppStore } from "@/lib/app-store"

function monthlyBadgeLabel(badge: PlayerMonthlyBadge): string {
  return badge.kind === "spending"
    ? `#1 Spend · ${badge.monthLabel}`
    : `#1 Tips · ${badge.monthLabel}`
}

/**
 * Passive inline cue for a player's current-month #1 sticker(s).
 * Visible on both mobile (where hover cards are disabled) and desktop.
 */
export function CurrentMonthBadgeCue({
  badges,
  size = "sm",
  inverted = false,
}: {
  badges?: readonly PlayerMonthlyBadge[]
  size?: "xs" | "sm" | "md"
  inverted?: boolean
}) {
  if (!badges || badges.length === 0) return null

  const imgSizeCls =
    size === "xs"
      ? "h-4 w-4"
      : size === "md"
        ? "h-7 w-7"
        : "h-5 w-5"
  const imgPx = size === "xs" ? 16 : size === "md" ? 28 : 20
  const iconBoxCls =
    size === "xs"
      ? "h-4 w-4"
      : size === "md"
        ? "h-6 w-6"
        : "h-5 w-5"
  const iconPx = size === "xs" ? 10 : size === "md" ? 14 : 11

  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {badges.map((badge) => {
        const label = monthlyBadgeLabel(badge)
        if (badge.stickerSrc) {
          return (
            <img
              key={`${badge.kind}-${badge.monthKey}`}
              src={badge.stickerSrc}
              alt={label}
              title={label}
              width={imgPx}
              height={imgPx}
              className={`${imgSizeCls} shrink-0 object-contain drop-shadow-xs`}
            />
          )
        }
        const Icon = badge.kind === "spending" ? Crown : Heart
        const toneCls = inverted
          ? "border border-current text-current"
          : badge.kind === "spending"
            ? "border border-[var(--rt-amber)] bg-[var(--rt-amber-soft)] text-[var(--rt-amber-ink)]"
            : "border border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
        return (
          <span
            key={`${badge.kind}-${badge.monthKey}`}
            title={label}
            aria-label={label}
            className={`inline-flex ${iconBoxCls} shrink-0 items-center justify-center rounded-sm ${toneCls}`}
          >
            <Icon size={iconPx} weight="fill" />
          </span>
        )
      })}
    </span>
  )
}

export function PlayerHoverCard({
  player,
  children,
  className = "",
}: {
  player: PlayerSummary
  children: ReactNode
  className?: string
}) {
  const { players } = useAppStore()
  const [open, setOpen] = useState(false)
  const timerRef = useRef<number | null>(null)

  const show = () => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches
    ) {
      return
    }
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setOpen(true), 160)
  }

  const hide = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setOpen(false), 100)
  }

  const spendBoard = getSpendingLeaderboard(players)
  const tipBoard = getTipLeaderboard(players)
  const topSpend = spendBoard[0]?.monthlySpend ?? 0
  const spendRank = spendBoard.findIndex((p) => p.id === player.id) + 1
  const tipRank = tipBoard.findIndex((p) => p.id === player.id) + 1
  const tier = tierForSpend(player.monthlySpend, topSpend)
  const owed = getPlayerUnpaidTotal(player)

  const currentBadges = player.currentMonthBadges ?? []

  return (
    <span
      className={`relative inline-flex max-w-full ${className}`.trim()}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      {open && (
        <div
          role="tooltip"
          className="rt2-tooltip-in pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-50 w-[290px] -translate-x-1/2 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-3.5 text-left text-[var(--rt-ink)] shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <PlayerAvatar player={player} size="md" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{player.name}</p>
                <p className="font-arcade-mono text-[12px] text-[var(--rt-muted)]">
                  {player.ordersCount} bills
                </p>
              </div>
            </div>
            {currentBadges.length > 0 && (
              <div className="flex shrink-0 items-center gap-1">
                {currentBadges.map((b) => {
                  const label = monthlyBadgeLabel(b)
                  if (b.stickerSrc) {
                    return (
                      <img
                        key={`${b.kind}-${b.monthKey}`}
                        src={b.stickerSrc}
                        alt={label}
                        width={44}
                        height={44}
                        className="h-11 w-11 shrink-0 object-contain drop-shadow-xs"
                      />
                    )
                  }
                  const Icon = b.kind === "spending" ? Crown : Heart
                  const toneCls =
                    b.kind === "spending"
                      ? "border-[var(--rt-amber)] bg-[var(--rt-amber-soft)] text-[var(--rt-amber-ink)]"
                      : "border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
                  return (
                    <span
                      key={`${b.kind}-${b.monthKey}`}
                      aria-label={label}
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border-2 ${toneCls}`}
                    >
                      <Icon size={18} weight="fill" />
                    </span>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <TierPill tier={tier} />
            {player.badge && (
              <span className="inline-flex items-center gap-1 rounded bg-[var(--rt-ink)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--rt-surface)]">
                <BadgeIcon badge={player.badge} size={11} />
                {player.badge}
              </span>
            )}
            {currentBadges.map((b) => {
              const Icon = b.kind === "spending" ? Crown : Heart
              const toneCls =
                b.kind === "spending"
                  ? "border-[var(--rt-amber)] bg-[var(--rt-amber-soft)] text-[var(--rt-amber-ink)]"
                  : "border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
              return (
                <span
                  key={`pill-${b.kind}-${b.monthKey}`}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-arcade-mono text-[11px] font-bold ${toneCls}`}
                >
                  <Icon size={11} weight="fill" />
                  {monthlyBadgeLabel(b)}
                </span>
              )
            })}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--rt-border-soft)] pt-2.5 font-arcade-mono text-[12px]">
            <div>
              <p className="text-[11px] text-[var(--rt-muted)]">
                Spend #{spendRank}
              </p>
              <p className="tnum font-bold">
                {formatRupiah(player.monthlySpend)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--rt-muted)]">
                Tip #{tipRank}
              </p>
              <p className="tnum font-bold text-[var(--rt-teal-ink)]">
                +{formatRupiah(player.monthlyTips)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--rt-muted)]">Open</p>
              <p
                className={`tnum font-bold ${
                  owed > 0
                    ? "text-[var(--rt-accent-ink)]"
                    : "text-[var(--rt-teal-ink)]"
                }`}
              >
                {owed > 0 ? formatRupiah(owed) : "Clear"}
              </p>
            </div>
          </div>
        </div>
      )}
    </span>
  )
}
