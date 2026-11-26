import {
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Clock,
  Copy,
  Crown,
  Heart,
  Lightning,
  Monitor,
  Moon,
  Percent,
  Plus,
  Repeat,
  ShieldStar,
  SignIn,
  SignOut,
  Sun,
  UserCircle,
  Warning,
  X,
} from "@phosphor-icons/react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { useEffect, useId, useRef, useState } from "react"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  SheetContent,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { getBillBossAsset } from "@/domain/boss"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsIndicator,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

import {
  formatAmountInput,
  formatRupiah,
  parseAmountInput,
} from "@/domain/money"
import {
  getBillRemainingAmount,
  getPlayerUnpaidTotal,
  getRoundUpOptions,
  getTipTargets,
  projectTipRank,
} from "@/domain/types"
import type {
  AppUserRole,
  BillSummary,
  EarnedBadge,
  PlayerSummary,
  tierForSpend,
} from "@/domain/types"
import { useAppStore, useOptionalAppStore } from "@/lib/app-store"
import type { HitEvent, ThemePreference } from "@/lib/app-store"
import { DEFAULT_BRANDING } from "@/lib/branding"
import { todayJakarta } from "@/lib/time"
import { LOADING_QUIPS, createLoadingQuipClock } from "./loading-quips"

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

export function monthTitleFromKey(monthKey: string): string {
  const [yStr, mStr] = monthKey.split("-")
  const year = Number(yStr)
  const monthIdx = Number(mStr) - 1
  if (!year || monthIdx < 0 || monthIdx > 11) return monthKey
  return `${MONTH_NAMES[monthIdx]} ${year}`
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [yStr, mStr] = monthKey.split("-")
  const year = Number(yStr) || Number(todayJakarta().slice(0, 4))
  const month = Number(mStr) || Number(todayJakarta().slice(5, 7))
  const totalMonths = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(totalMonths / 12)
  const nextMonth = ((totalMonths % 12) + 12) % 12
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth + 1).padStart(2, "0")}`
}

export function fmtDate(
  iso: string,
  options?: { includeYear?: boolean }
): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const currentYear = Number(todayJakarta().slice(0, 4))
  const includeYear = options?.includeYear ?? d.getFullYear() !== currentYear
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short" })
  const day = String(d.getDate()).padStart(2, "0")
  const month = d.toLocaleDateString("en-GB", { month: "short" })
  return includeYear
    ? `${weekday}, ${day} ${month} ${d.getFullYear()}`
    : `${weekday}, ${day} ${month}`
}

export function fmtTime24(date: Date): string {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export function BadgeIcon({
  badge,
  size = 15,
}: {
  badge: EarnedBadge
  size?: number
}) {
  switch (badge) {
    case "Top spender":
      return <Crown size={size} weight="fill" />
    case "Big heart":
      return <Heart size={size} weight="fill" />
    case "Discount hunter":
      return <Percent size={size} weight="bold" />
    case "Loyal":
      return <Repeat size={size} weight="bold" />
    case "Biggest strike":
      return <Lightning size={size} weight="fill" />
  }
}

/** 16 WCAG AA colors (white #FFFFFF text >= 4.5:1 on every swatch). */
const AVATAR_PALETTE_16 = [
  "#B91C1C", // crimson
  "#C2410C", // burnt orange
  "#B45309", // amber ochre
  "#4D7C0F", // moss olive
  "#15803D", // forest green
  "#047857", // emerald
  "#0F766E", // deep teal
  "#0E7490", // ocean cyan
  "#0369A1", // cobalt sky
  "#1D4ED8", // royal blue
  "#4338CA", // indigo
  "#6D28D9", // violet
  "#7E22CE", // purple
  "#A21CAF", // plum magenta
  "#BE185D", // berry rose
  "#334155", // gunmetal slate
] as const

export function getAvatarColor(seed: string): string {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return AVATAR_PALETTE_16[Math.abs(hash) % AVATAR_PALETTE_16.length]
}

export function PlayerAvatar({
  player,
  size = "md",
  chamfer: _chamfer = false,
  heroAttr = false,
  heroStyle = false,
  className = "",
}: {
  player: Pick<PlayerSummary, "name" | "avatar" | "avatarUrl" | "avatarBanned"> & {
    id?: string
  }
  size?: "sm" | "md" | "lg" | "xl"
  chamfer?: boolean
  heroAttr?: boolean
  heroStyle?: boolean
  className?: string
}) {
  const sizeCls =
    size === "sm"
      ? "h-7 w-7 text-[11px]"
      : size === "lg"
        ? "h-16 w-16 text-2xl"
        : size === "xl"
          ? "h-24 w-24 text-4xl sm:h-28 sm:w-28"
          : "h-10 w-10 text-[14px]"
  const showImg = Boolean(player.avatarUrl) && !player.avatarBanned
  const bgColor = getAvatarColor(player.id ?? player.name)

  return (
    <span
      {...(heroAttr ? { "data-hero-avatar": "" } : {})}
      style={{
        ...(heroStyle ? { viewTransitionName: "hero-player-avatar" } : {}),
        ...(showImg ? {} : { backgroundColor: bgColor, color: "#FFFFFF" }),
      }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-arcade-mono font-bold ${sizeCls} ${className}`}
    >
      {showImg ? (
        <img
          src={player.avatarUrl ?? undefined}
          alt={player.name}
          className="h-full w-full object-cover"
        />
      ) : (
        player.avatar
      )}
    </span>
  )
}

const TIER_DESCRIPTIONS: Record<ReturnType<typeof tierForSpend>, string> = {
  "Final Boss": "75%+ of the #1 monthly spender",
  Miniboss: "50% to 74% of the #1 monthly spender",
  Regular: "25% to 49% of the #1 monthly spender",
  Rookie: "Under 25% of the #1 monthly spender",
}

const BADGE_DESCRIPTIONS: Record<EarnedBadge, string> = {
  "Top spender": "Highest total spend this month",
  "Big heart": "Highest total tips dropped in the jar",
  "Discount hunter": "Highest voucher discount savings rate",
  Loyal: "Joined the most group orders this month",
  "Biggest strike": "Largest single-bill share this month",
}

export function TierPill({
  tier,
}: {
  tier: ReturnType<typeof tierForSpend>
}) {
  const cls =
    tier === "Final Boss"
      ? "border-[var(--rt-accent)] bg-[var(--rt-accent-soft)] text-[var(--rt-accent-ink)]"
      : tier === "Miniboss"
        ? "border-[var(--rt-amber)] bg-[var(--rt-amber-soft)] text-[var(--rt-amber-ink)]"
        : tier === "Regular"
          ? "border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
          : "border-[var(--rt-ui-border)] bg-[var(--rt-surface-alt)] text-[var(--rt-muted)]"

  return (
    <span className="group/tip relative inline-flex">
      <span
        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-arcade-mono text-[12px] font-bold ${cls}`}
      >
        <ShieldStar size={12} weight="fill" />
        {tier}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 hidden -translate-x-1/2 rounded bg-[var(--rt-tip-bg)] px-2.5 py-1 font-ui-sans text-[12px] font-semibold whitespace-nowrap text-[var(--rt-tip-ink)] shadow-lg group-hover/tip:block"
      >
        {TIER_DESCRIPTIONS[tier]}
      </span>
    </span>
  )
}

export function EarnedBadgePill({
  badge,
}: {
  badge: EarnedBadge
}) {
  return (
    <span className="group/tip relative inline-flex">
      <span className="inline-flex items-center gap-1 rounded bg-[var(--rt-ink)] px-1.5 py-0.5 text-[12px] font-bold text-[var(--rt-surface)]">
        <BadgeIcon badge={badge} size={12} />
        {badge}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 hidden -translate-x-1/2 rounded bg-[var(--rt-tip-bg)] px-2.5 py-1 font-ui-sans text-[12px] font-semibold whitespace-nowrap text-[var(--rt-tip-ink)] shadow-lg group-hover/tip:block"
      >
        {BADGE_DESCRIPTIONS[badge]}
      </span>
    </span>
  )
}

/* ================================================================
   CurrencyInput (48px tall, Rp prefix, thousands grouping, clear X)
   ================================================================ */
export function CurrencyInput({
  label,
  value,
  onChange,
  onEnter,
  placeholder = "0",
}: {
  label: string
  value: number
  onChange: (next: number) => void
  onEnter?: () => void
  placeholder?: string
}) {
  const inputId = useId()
  const [text, setText] = useState<string>(
    value > 0 ? formatAmountInput(String(value)) : ""
  )

  useEffect(() => {
    const parsed = parseAmountInput(text) ?? 0
    if (parsed !== value) {
      setText(value > 0 ? formatAmountInput(String(value)) : "")
    }
  }, [value])

  const handleChange = (raw: string) => {
    const formatted = formatAmountInput(raw)
    setText(formatted)
    const parsed = parseAmountInput(formatted)
    onChange(parsed !== null && parsed >= 0 ? parsed : 0)
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-[14px] font-bold text-[var(--rt-ink)]"
      >
        {label}
      </label>
      <div className="relative flex h-12 items-center rounded border-2 border-[var(--rt-border)] bg-[var(--rt-bg)] shadow-inner focus-within:border-[var(--rt-accent)]">
        <span
          aria-hidden
          className="pl-3 font-arcade-mono text-[16px] font-bold text-[var(--rt-accent-ink)] select-none"
        >
          Rp
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          value={text}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              e.preventDefault()
              onEnter()
            }
          }}
          className="tnum h-full w-full bg-transparent px-2 font-arcade-mono text-[18px] font-bold text-[var(--rt-ink)] focus:outline-none"
        />
        {text.length > 0 && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={() => {
              setText("")
              onChange(0)
            }}
            className="rt2-focus flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center text-[var(--rt-muted)] hover:text-[var(--rt-ink)]"
          >
            <X size={16} weight="bold" />
          </button>
        )}
      </div>
    </div>
  )
}

/* ================================================================
   Bill Boss Avatar (4 HP-stage variants, 25% each)
   ================================================================ */
export function BillBossAvatar({
  bill,
  size = "md",
  className = "",
}: {
  bill: BillSummary
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const remaining = getBillRemainingAmount(bill)
  const total = bill.splits.reduce((s, x) => s + x.totalOwed, 0) || bill.finalTotal
  const boss = getBillBossAsset(remaining, total)
  const sizeClass =
    size === "sm"
      ? "h-24 w-24 sm:h-28 sm:w-28"
      : size === "lg"
        ? "h-32 w-32 sm:h-36 sm:w-36"
        : "h-28 w-28 sm:h-32 sm:w-32"

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center ${sizeClass} ${className}`}
      title={`${boss.label} (${boss.healthPct}% HP)`}
    >
      <img
        src={boss.src}
        alt={`${bill.merchant} boss - ${boss.label} (${boss.healthPct}% HP)`}
        className="h-full w-full object-contain drop-shadow-sm"
        loading="lazy"
      />
    </div>
  )
}

export function HpBarLegend({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-4 text-[14px] text-[var(--rt-muted)] ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-[var(--rt-chunk-paid)] text-white">
          <Check size={11} weight="bold" />
        </span>
        Paid
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="rt2-pending-hatch inline-flex h-4 w-4 items-center justify-center rounded-sm bg-[var(--rt-chunk-pending)]"
          style={{ color: "var(--rt-chunk-pending-fg)" }}
        >
          <Clock size={11} weight="bold" />
        </span>
        Pending
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-[var(--rt-chunk-unpaid)] text-white">
          <Warning size={11} weight="bold" />
        </span>
        Your unpaid
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-4 w-4 rounded-sm bg-[var(--rt-chunk-other)]" />
        Other unpaid
      </span>
    </div>
  )
}

/* ================================================================
   Boss Armor HP Bar with Chunk Hover/Focus Tooltips
   ================================================================ */
export function HpBar({
  bill,
  players,
  youId,
  preview,
  hit,
  tall = false,
  showLegend = false,
}: {
  bill: BillSummary
  players: PlayerSummary[]
  youId: string
  preview: boolean
  hit: HitEvent | null
  tall?: boolean
  showLegend?: boolean
}) {
  const navigate = useNavigate()
  const remaining = getBillRemainingAmount(bill)
  const total = bill.splits.reduce((s, x) => s + x.totalOwed, 0) || 1
  const orderedSplits = [...bill.splits].sort((a, b) => {
    const rank = (s: (typeof bill.splits)[number]) => {
      if (s.status === "paid") return 0
      const player = players.find((p) => p.id === s.playerId)
      if (player?.pendingClaim) return 1
      if (s.playerId === youId) return 2
      return 3
    }
    return rank(a) - rank(b)
  })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => new Set())
  const barRef = useRef<HTMLDivElement>(null)

  const activeTipId = pinnedId ?? hoveredId
  const dismissFx = (k: string) =>
    setDismissedKeys((prev) => new Set(prev).add(k))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHoveredId(null)
        setPinnedId(null)
      }
    }
    const onOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setPinnedId(null)
      }
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("mousedown", onOutside)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("mousedown", onOutside)
    }
  }, [])

  return (
    <div ref={barRef} className="relative">
      {/* 0 to 100% Scale Ruler */}
      <div
        aria-hidden
        className="mb-1 flex items-end justify-between font-arcade-mono text-[14px] text-[var(--rt-muted)]"
      >
        <span>0%</span>
        <div className="mx-2 flex flex-1 items-end justify-between">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className={`w-[1px] bg-[var(--rt-ui-border)] ${
                i % 2 === 1 ? "h-2.5" : "h-1.5"
              }`}
            />
          ))}
        </div>
        <span>100%</span>
      </div>

      {/* Track + Sibling FX & Tooltip Layer (scoped strictly to the track height) */}
      <div className="relative">
      <div
        role="meter"
        aria-label={`${bill.merchant} armor integrity`}
        aria-valuenow={remaining}
        aria-valuemax={bill.finalTotal}
        className={`flex w-full gap-[3px] rounded-[3px] border-2 border-[var(--rt-border)] bg-[var(--rt-bg)] p-[3px] ${
          tall ? "h-11" : "h-8"
        }`}
      >
        {orderedSplits.map((s) => {
          const player = players.find((p) => p.id === s.playerId)
          const chunkState =
            s.status === "paid"
              ? "paid"
              : player?.pendingClaim
                ? "pending"
                : "unpaid"
          const isMine = s.playerId === youId
          const isPreview = preview && isMine && chunkState === "unpaid"
          const widthPct = (s.totalOwed / total) * 100
          const isDimmed = activeTipId !== null && activeTipId !== s.playerId
          const bevelStyle =
            widthPct >= 3
              ? {
                  clipPath:
                    "polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))",
                }
              : undefined

          return (
            <button
              key={s.playerId}
              type="button"
              onMouseEnter={() => setHoveredId(s.playerId)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(s.playerId)}
              onBlur={() => setHoveredId(null)}
              onClick={(e) => {
                e.stopPropagation()
                const isCoarse =
                  typeof window !== "undefined" &&
                  window.matchMedia("(pointer: coarse)").matches
                if (isCoarse && pinnedId !== s.playerId) {
                  setPinnedId(s.playerId)
                  return
                }
                void navigate({
                  to: "/players/$playerId",
                  params: { playerId: s.playerId },
                })
              }}
              aria-label={`${s.name}, owes ${formatRupiah(s.totalOwed)}, ${chunkState}. Open dossier`}
              style={{
                width: `${widthPct}%`,
                opacity: isDimmed ? 0.55 : 1,
              }}
              className={`rt2-chunk-btn @container relative h-full border-0 p-0 ${
                isPreview ? "rt2-flicker-wrap z-10" : ""
              }`}
            >
              {/* fix 3: stacked status layers */}
              <div
                className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
                style={{
                  ...bevelStyle,
                  backgroundColor: isMine
                    ? "var(--rt-chunk-unpaid)"
                    : "var(--rt-chunk-other)",
                  opacity: chunkState === "unpaid" ? 1 : 0,
                }}
              >
                {isMine && <div className="rt2-caution absolute inset-0" />}
                {chunkState === "unpaid" && (
                  <Warning
                    size={14}
                    weight="bold"
                    className="relative z-10 hidden text-white @[26px]:inline-flex"
                  />
                )}
                {isPreview && (
                  <svg
                    viewBox="0 0 60 22"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute inset-0 hidden h-full w-full @[26px]:block"
                    aria-hidden
                  >
                    <path
                      d="M14 0 L24 9 L19 14 L34 22"
                      fill="none"
                      stroke="#12161B"
                      strokeWidth="2"
                      className="rt2-crack-path"
                    />
                  </svg>
                )}
              </div>

              <div
                className="rt2-pending-hatch absolute inset-0 flex items-center justify-center bg-[var(--rt-chunk-pending)] transition-opacity duration-200"
                style={{
                  ...bevelStyle,
                  opacity: chunkState === "pending" ? 1 : 0,
                  color: "var(--rt-chunk-pending-fg)",
                }}
              >
                {chunkState === "pending" && (
                  <Clock
                    size={15}
                    weight="bold"
                    className="hidden @[26px]:inline-flex"
                  />
                )}
              </div>

              <div
                className="absolute inset-0 flex items-center justify-center bg-[var(--rt-chunk-paid)] transition-opacity duration-240"
                style={{
                  ...bevelStyle,
                  opacity: chunkState === "paid" ? 1 : 0,
                }}
              >
                {chunkState === "paid" && (
                  <Check
                    size={14}
                    weight="bold"
                    className="hidden text-white @[26px]:inline-flex"
                  />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Sibling FX & Tooltip Layer (fix 6: unclipped, bound to track height) */}
      <div className="pointer-events-none absolute inset-0 overflow-visible">
        {orderedSplits.map((s, idx) => {
          const leftPct =
            (orderedSplits.slice(0, idx).reduce((sum, x) => sum + x.totalOwed, 0) /
              total) *
            100
          const widthPct = (s.totalOwed / total) * 100
          const rawCenterPct = leftPct + widthPct / 2
          const centerPct = Math.min(84, Math.max(16, rawCenterPct))
          const isMine = s.playerId === youId
          const player = players.find((p) => p.id === s.playerId)
          const chunkState =
            s.status === "paid"
              ? "paid"
              : player?.pendingClaim
                ? "pending"
                : "unpaid"
          const isPreview = preview && isMine && chunkState === "unpaid"
          const showTooltip = activeTipId === s.playerId
          const tipPaid =
            s.paidAmount !== null ? Math.max(0, s.paidAmount - s.totalOwed) : 0

          const hitMatch =
            hit &&
            hit.playerId === s.playerId &&
            hit.perBill.find((b) => b.billId === bill.id)
          const fxKey = hitMatch ? `${hit.key}-${bill.id}-${s.playerId}` : null
          const showFx = fxKey !== null && !dismissedKeys.has(fxKey)

          return (
            <div key={s.playerId}>
              {showTooltip && (
                <div
                  role="tooltip"
                  style={
                    {
                      "--tip-x": `clamp(125px, ${rawCenterPct}%, calc(100% - 125px))`,
                    } as React.CSSProperties
                  }
                  className="rt2-chamfer-frame rt2-tooltip-in absolute inset-x-0 bottom-full z-40 mx-auto mb-2.5 w-[min(268px,100%)] bg-[var(--rt-ui-border)] shadow-xl sm:inset-x-auto sm:left-[var(--tip-x)] sm:mx-0 sm:w-[250px] sm:-translate-x-1/2"
                >
                  <div className="rt2-chamfer-inner bg-[var(--rt-tip-bg)] p-3 text-left text-[14px] text-[var(--rt-tip-ink)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-[16px] font-bold">
                      {player && <PlayerAvatar player={player} size="sm" />}
                      <span className="truncate">
                        {s.name}
                        {isMine ? " (You)" : ""}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 font-arcade-mono text-[14px] font-bold">
                      {chunkState === "paid" && (
                        <>
                          <Check size={14} weight="bold" className="text-[#5CE6DD]" />
                          <span className="text-[#5CE6DD]">Paid</span>
                        </>
                      )}
                      {chunkState === "pending" && (
                        <>
                          <Clock size={14} weight="bold" className="text-[#FCD765]" />
                          <span className="text-[#FCD765]">Pending</span>
                        </>
                      )}
                      {chunkState === "unpaid" && (
                        <>
                          <Warning size={14} weight="bold" className="text-[#FF956B]" />
                          <span className="text-[#FF956B]">Unpaid</span>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="tnum mt-1 font-arcade-mono text-[17px] font-bold">
                    Owes {formatRupiah(s.totalOwed)}
                  </p>
                  {chunkState === "paid" && (
                    <p className="tnum mt-0.5 text-[14px] text-[#5CE6DD]">
                      Paid {formatRupiah(s.paidAmount ?? s.totalOwed)}
                      {tipPaid > 0 ? ` (+${formatRupiah(tipPaid)} tip)` : ""}
                    </p>
                  )}
                  {chunkState === "pending" && player?.pendingClaim && (
                    <p className="tnum mt-0.5 text-[14px] text-[#FCD765]">
                      Claimed {formatRupiah(player.pendingClaim.claimedAmount)} (
                      {player.pendingClaim.submittedAt})
                    </p>
                  )}
                  {chunkState === "unpaid" && (
                    <p className="mt-0.5 text-[14px] text-[var(--rt-tip-muted)]">
                      Nothing reported yet
                    </p>
                  )}
                  <p className="mt-1.5 border-t border-white/15 pt-1.5 text-[13px] text-[var(--rt-tip-muted)]">
                    Click to open {s.name}’s dossier
                  </p>
                  </div>
                </div>
              )}

              {isPreview && (
                <>
                  <div
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    className="rt2-reticle absolute -inset-y-1 z-30"
                  >
                    <span className="absolute top-0 left-0 h-2 w-2 border-t-2 border-l-2 border-[var(--rt-accent)]" />
                    <span className="absolute top-0 right-0 h-2 w-2 border-t-2 border-r-2 border-[var(--rt-accent)]" />
                    <span className="absolute bottom-0 left-0 h-2 w-2 border-b-2 border-l-2 border-[var(--rt-accent)]" />
                    <span className="absolute bottom-0 right-0 h-2 w-2 border-b-2 border-r-2 border-[var(--rt-accent)]" />
                  </div>
                  <span
                    style={{ left: `${centerPct}%` }}
                    className="tnum absolute top-[calc(100%+4px)] z-30 -translate-x-1/2 rounded-sm bg-[var(--rt-tip-bg)] px-2 py-0.5 font-arcade-mono text-[14px] font-bold whitespace-nowrap text-[#FF956B]"
                  >
                    -{formatRupiah(s.totalOwed)}
                  </span>
                </>
              )}

              {showFx && hitMatch && (
                <>
                  <span
                    key={fxKey}
                    onAnimationEnd={() => dismissFx(fxKey)}
                    style={{ left: `${centerPct}%` }}
                    className={`rt2-floater tnum absolute -top-5 z-40 rounded-sm bg-[var(--rt-tip-bg)] px-2 py-0.5 font-arcade-mono text-[15px] font-bold whitespace-nowrap ${
                      hit.kind === "collect" ? "text-[#5CE6DD]" : "text-[#FF956B]"
                    }`}
                  >
                    -{formatRupiah(hitMatch.amount)}
                  </span>
                  {hit.kind === "collect" && (
                    <div
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      className="absolute inset-y-0 z-30"
                    >
                      <span className="rt2-shard-1 absolute inset-0 bg-[var(--rt-amber-bg)]" />
                      <span className="rt2-shard-2 absolute inset-0 bg-[var(--rt-accent)]" />
                      <span className="rt2-shard-3 absolute inset-0 bg-[var(--rt-ink)]" />
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
      </div>

      {showLegend && <HpBarLegend className="mt-2.5" />}
    </div>
  )
}

/* ================================================================
   PayAllCard (Shared by Home & Player Detail)
   ================================================================ */
export function PayAllCard({
  player,
  players,
  role,
  onSignIn,
  onNotify,
  onPreviewChange,
}: {
  player: PlayerSummary
  players: PlayerSummary[]
  role: AppUserRole
  onSignIn: () => void
  onNotify: (player: PlayerSummary, amount: number) => void | Promise<boolean>
  onPreviewChange: (active: boolean) => void
}) {
  const { paymentMethods, me, signingIn } = useAppStore()
  const owed = getPlayerUnpaidTotal(player)
  const roundOptions = getRoundUpOptions(owed)
  const [selectedAmount, setSelectedAmount] = useState<number>(owed)
  const [copiedDigits, setCopiedDigits] = useState(false)
  const [copiedMethodId, setCopiedMethodId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const claim = player.pendingClaim
  const isLinkedSelf = me.authenticated && me.linkedPlayerId === player.id

  useEffect(() => {
    setSelectedAmount(owed)
  }, [player.id, owed])

  useEffect(() => {
    onPreviewChange(false)
    return () => onPreviewChange(false)
  }, [player.id, role, claim?.submittedAt])

  const selectedTip = Math.max(0, selectedAmount - owed)
  const underpay = Math.max(0, owed - selectedAmount)
  const projection = projectTipRank(players, player.id, selectedTip)
  const targets = getTipTargets(players, player.id)

  const handleChipToggle = (amount: number) => {
    if (amount === selectedAmount && amount !== owed) {
      setSelectedAmount(owed)
    } else {
      setSelectedAmount(amount)
    }
  }

  const handleCopy = (amount: number = selectedAmount) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(String(amount))
    }
    setCopiedDigits(true)
    setTimeout(() => setCopiedDigits(false), 1600)
  }

  const handleCopyAccount = (methodId: string, accountNumber: string) => {
    const cleanNumber = accountNumber.replace(/[^a-zA-Z0-9]/g, "")
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(cleanNumber)
    }
    setCopiedMethodId(methodId)
    setTimeout(() => {
      setCopiedMethodId((curr) => (curr === methodId ? null : curr))
    }, 1600)
  }

  const triggerNotify = async () => {
    if (
      role === "guest" ||
      !isLinkedSelf ||
      claim ||
      owed <= 0 ||
      selectedAmount <= 0 ||
      submitting
    ) {
      return
    }
    onPreviewChange(false)
    setSubmitting(true)
    try {
      const ok = await onNotify(player, selectedAmount)
      if (ok !== false) setReportOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface)] p-5">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--rt-border-soft)] pb-3">
        <span className="flex min-w-0 items-center gap-2 text-[15px] font-bold text-[var(--rt-muted)]">
          <PlayerAvatar player={player} size="sm" />
          <span className="truncate">Pay all ({player.name})</span>
        </span>
        <span className="tnum shrink-0 font-arcade-mono text-[14px] text-[var(--rt-muted)]">
          {player.unpaidBills.length} bills
        </span>
      </div>

      {owed === 0 ? (
        <div className="py-6">
          <p className="rt2-display text-4xl font-extrabold text-[var(--rt-teal-ink)]">
            All clear
          </p>
          <p className="mt-1 text-[15px] text-[var(--rt-muted)]">
            Zero unpaid bills. Monthly tips:{" "}
            <span className="tnum font-arcade-mono text-[17px] font-bold text-[var(--rt-ink)]">
              +{formatRupiah(player.monthlyTips)}
            </span>
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <p className="rt2-display tnum text-5xl leading-none font-extrabold sm:text-[56px]">
            {formatRupiah(owed)}
          </p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCopy(owed)}
                  className={`rt2-focus rt2-btn-secondary relative flex min-h-[48px] items-center justify-center gap-1.5 rounded px-3 font-arcade-mono text-[15px] font-bold ${
                    copiedDigits ? "rt2-pop border-[var(--rt-teal)] text-[var(--rt-teal-ink)]" : ""
                  }`}
                >
                  {copiedDigits ? <Check size={16} weight="bold" /> : <Copy size={16} />}
                  {copiedDigits ? "Copied" : `Copy ${owed}`}
                </button>
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  onMouseEnter={() => !claim && onPreviewChange(true)}
                  onMouseLeave={() => onPreviewChange(false)}
                  onFocus={() => !claim && onPreviewChange(true)}
                  onBlur={() => onPreviewChange(false)}
                  className={`rt2-focus min-h-[48px] rounded px-3 text-[15px] font-bold ${
                    claim ? "rt2-btn-secondary" : "rt2-btn-primary"
                  }`}
                >
                  {claim ? "View details" : "Pay & report"}
                </button>
              </div>

              {claim && (
                <p className="rounded border border-[var(--rt-amber)] bg-[var(--rt-amber-soft)] px-3 py-2 text-[14px] font-semibold text-[var(--rt-amber-ink)]">
                  Reported {formatRupiah(claim.claimedAmount)}, waiting for admin
                  confirmation.
                </p>
              )}

              <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[var(--rt-muted)]">
                <Crown size={16} weight="fill" className="shrink-0 text-[var(--rt-amber-ink)]" />
                {targets.currentRank === 1 || targets.toFirst === null ? (
                  "You hold #1 on the Tip Rank"
                ) : (
                  <span>
                    Tip{" "}
                    <span className="tnum font-arcade-mono font-bold text-[var(--rt-ink)]">
                      +{formatRupiah(targets.toFirst)}
                    </span>{" "}
                    to beat #1 ({targets.firstName})
                  </span>
                )}
              </p>

              {paymentMethods.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[13px] font-bold text-[var(--rt-muted)]">
                    Transfer to ({paymentMethods.length})
                  </p>
                  {paymentMethods.map((m) => {
                    const isCopied = copiedMethodId === m.id
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleCopyAccount(m.id, m.accountNumber)}
                        className={`rt2-focus rt2-btn-secondary flex w-full items-start justify-between gap-2 rounded px-2.5 py-2 text-left ${
                          isCopied ? "border-[var(--rt-teal)]" : ""
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block text-[13px] font-bold">
                            {m.label}
                            {m.isPrimary ? " (Primary)" : ""}
                          </span>
                          <span className="tnum block font-arcade-mono text-[16px] font-bold">
                            {m.accountNumber}
                          </span>
                          <span className="block text-[12px] break-words text-[var(--rt-muted)]">
                            {m.accountHolder}
                            {m.note ? ` · ${m.note}` : ""}
                          </span>
                        </span>
                        {isCopied ? (
                          <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-[var(--rt-teal-ink)]" />
                        ) : (
                          <Copy size={16} className="mt-0.5 shrink-0 text-[var(--rt-teal-ink)]" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          
        </div>
      )}

      <Dialog
        open={reportOpen}
        onOpenChange={(next) => !submitting && setReportOpen(next)}
      >
        <DialogContent className="rt2-scroll-fade-y max-h-[92dvh] gap-3 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:max-w-2xl">
          <div className="flex items-baseline justify-between gap-3">
            <DialogTitle className="rt2-display text-xl font-extrabold">
              Pay &amp; report
            </DialogTitle>
            <DialogDescription className="truncate text-[13px] text-[var(--rt-muted)]">
              {player.name} owes {formatRupiah(owed)}
            </DialogDescription>
          </div>

          <div className="space-y-3">
            <div
              className="grid grid-cols-3 gap-1.5"
              role="group"
              aria-label="Quick amounts"
            >
              {roundOptions.map((opt) => {
                const chosen = selectedAmount === opt.amount
                return (
                  <button
                    key={opt.amount}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => handleChipToggle(opt.amount)}
                    className={`rt2-focus flex cursor-pointer flex-col items-start rounded border-2 px-2 py-1.5 text-left transition ${
                      chosen
                        ? "border-[var(--rt-ink)] bg-[var(--rt-ink)] text-[var(--rt-surface)]"
                        : "rt2-btn-secondary"
                    }`}
                  >
                    <span className="text-[12px] font-bold opacity-80">
                      {opt.label}
                    </span>
                    <span className="tnum font-arcade-mono text-[14px] font-bold">
                      {formatRupiah(opt.amount)}
                    </span>
                    {opt.tip > 0 && (
                      <span
                        className={`tnum font-arcade-mono text-[11px] font-semibold ${
                          chosen
                            ? "text-current opacity-85"
                            : "text-[var(--rt-teal-ink)]"
                        }`}
                      >
                        +{formatRupiah(opt.tip)}
                      </span>
                    )}
                  </button>
                )
              })}
              {targets.currentRank !== 1 &&
                targets.toNext !== null &&
                targets.nextRank !== null && (
                  <button
                    type="button"
                    aria-pressed={selectedAmount === owed + targets.toNext}
                    onClick={() => handleChipToggle(owed + targets.toNext!)}
                    className={`rt2-focus flex cursor-pointer flex-col items-start rounded border-2 px-2 py-1.5 text-left transition ${
                      selectedAmount === owed + targets.toNext
                        ? "border-[var(--rt-ink)] bg-[var(--rt-ink)] text-[var(--rt-surface)]"
                        : "rt2-btn-secondary"
                    }`}
                  >
                    <span className="w-full truncate text-[12px] font-bold opacity-80">
                      Next #{targets.nextRank} {targets.nextName}
                    </span>
                    <span className="tnum font-arcade-mono text-[14px] font-bold">
                      {formatRupiah(owed + targets.toNext)}
                    </span>
                    <span
                      className={`tnum font-arcade-mono text-[11px] font-semibold ${
                        selectedAmount === owed + targets.toNext
                          ? "text-current opacity-85"
                          : "text-[var(--rt-teal-ink)]"
                      }`}
                    >
                      +{formatRupiah(targets.toNext)}
                    </span>
                  </button>
                )}
              {targets.currentRank !== 1 && targets.toFirst !== null && (
                <button
                  type="button"
                  aria-pressed={selectedAmount === owed + targets.toFirst}
                  onClick={() => handleChipToggle(owed + targets.toFirst!)}
                  className={`rt2-focus flex cursor-pointer flex-col items-start rounded border-2 px-2 py-1.5 text-left transition ${
                    selectedAmount === owed + targets.toFirst
                      ? "border-[var(--rt-ink)] bg-[var(--rt-ink)] text-[var(--rt-surface)]"
                      : "rt2-btn-secondary"
                  }`}
                >
                  <span className="flex w-full items-center gap-1 truncate text-[12px] font-bold opacity-80">
                    <Crown
                      size={12}
                      weight="fill"
                      className={
                        selectedAmount === owed + targets.toFirst
                          ? "shrink-0 text-current"
                          : "shrink-0 text-[var(--rt-amber-ink)]"
                      }
                    />
                    <span className="truncate">#1 {targets.firstName}</span>
                  </span>
                  <span className="tnum font-arcade-mono text-[14px] font-bold">
                    {formatRupiah(owed + targets.toFirst)}
                  </span>
                  <span
                    className={`tnum font-arcade-mono text-[11px] font-semibold ${
                      selectedAmount === owed + targets.toFirst
                        ? "text-current opacity-85"
                        : "text-[var(--rt-teal-ink)]"
                    }`}
                  >
                    +{formatRupiah(targets.toFirst)}
                  </span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-2 px-0.5 text-[12px]">
              <span
                className="text-[var(--rt-muted)]"
                title={
                  projection.overtakes.length > 2
                    ? `Passes ${projection.overtakes.join(", ")}`
                    : undefined
                }
              >
                {projection.overtakes.length === 1
                  ? `Passes ${projection.overtakes[0]}`
                  : projection.overtakes.length === 2
                    ? `Passes ${projection.overtakes[0]} and ${projection.overtakes[1]}`
                    : projection.overtakes.length > 2
                      ? `Passes ${projection.overtakes[0]} and ${projection.overtakes.length - 1} others`
                      : targets.currentRank === 1
                        ? "You hold #1 on the Tip Rank"
                        : selectedTip > 0
                          ? `Adds +${formatRupiah(selectedTip)} tip`
                          : "Pick a quick amount or enter a custom amount"}
              </span>
              <span
                key={`${projection.projectedRank}-${selectedTip}`}
                className="rt2-rank-jump tnum font-arcade-mono text-[13px] font-bold text-[var(--rt-teal-ink)]"
              >
                Tip rank:{" "}
                {selectedTip === 0
                  ? `#${projection.currentRank}`
                  : `#${projection.currentRank} to #${projection.projectedRank}`}
              </span>
            </div>

            <div>
              <CurrencyInput
                label="Custom amount"
                value={selectedAmount}
                onChange={setSelectedAmount}
                onEnter={triggerNotify}
              />
              {underpay > 0 && (
                <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--rt-accent-ink)]">
                  <Warning size={15} weight="bold" className="shrink-0" />
                  Below your split by {formatRupiah(underpay)}. Notify will
                  report an underpay.
                </p>
              )}
            </div>
          </div>

          {paymentMethods.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--rt-muted)]">
                Transfer to ({paymentMethods.length})
              </p>
              <ul className="divide-y divide-[var(--rt-border-soft)] rounded border border-[var(--rt-border-soft)] bg-[var(--rt-bg)]/60">
                {paymentMethods.map((m) => {
                  const isCopied = copiedMethodId === m.id
                  return (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[13px] font-semibold text-[var(--rt-muted)]">
                            {m.label}
                            {m.isPrimary ? " (Primary)" : ""}
                          </span>
                          <span className="tnum font-arcade-mono text-[14px] font-bold text-[var(--rt-ink)]">
                            {m.accountNumber}
                          </span>
                        </div>
                        <p className="truncate text-[12px] text-[var(--rt-muted)]">
                          {m.accountHolder}
                          {m.note ? ` · ${m.note}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyAccount(m.id, m.accountNumber)}
                        aria-label={`Copy ${m.label} account number`}
                        className={`rt2-focus inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded border px-2.5 text-[12px] font-bold transition ${
                          isCopied
                            ? "border-[var(--rt-teal)] bg-[var(--rt-teal-soft)] text-[var(--rt-teal-ink)]"
                            : "border-[var(--rt-border-soft)] bg-[var(--rt-surface)] text-[var(--rt-muted)] hover:border-[var(--rt-border)] hover:text-[var(--rt-ink)]"
                        }`}
                      >
                        {isCopied ? (
                          <>
                            <Check size={13} weight="bold" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            Copy
                          </>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleCopy(selectedAmount)}
              className={`rt2-focus rt2-btn-secondary relative flex min-h-[44px] items-center justify-center gap-1.5 rounded px-3 font-arcade-mono text-[14px] font-bold ${
                copiedDigits ? "rt2-pop border-[var(--rt-teal)] text-[var(--rt-teal-ink)]" : ""
              }`}
            >
              {copiedDigits ? <Check size={16} weight="bold" /> : <Copy size={16} />}
              {copiedDigits ? "Copied" : `Copy ${selectedAmount}`}
            </button>
            {role === "guest" ? (
              <button
                type="button"
                disabled={signingIn}
                onClick={onSignIn}
                className="rt2-focus rt2-btn-primary inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded px-3 text-[14px] font-bold disabled:opacity-70"
              >
                <SignIn size={16} weight="bold" className={signingIn ? "animate-pulse" : ""} />
                {signingIn ? "Signing in..." : "Sign in to notify"}
              </button>
            ) : claim ? (
              <div className="flex min-h-[44px] items-center justify-center gap-1.5 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-amber-bg)] px-3 text-[14px] font-bold text-[#12161B]">
                <Clock size={16} weight="bold" />
                Reported
              </div>
            ) : isLinkedSelf ? (
              <button
                type="button"
                disabled={selectedAmount <= 0 || submitting}
                onClick={() => void triggerNotify()}
                className="rt2-focus rt2-btn-primary min-h-[44px] rounded px-3 font-arcade-mono text-[14px] font-bold"
              >
                {submitting ? "Sending..." : `Notify ${formatRupiah(selectedAmount)}`}
              </button>
            ) : (
              <div
                title="Only the linked account for this player can submit a transfer claim"
                className="flex min-h-[44px] items-center justify-center rounded border-2 border-dashed border-[var(--rt-ui-border)] bg-[var(--rt-bg)] px-2.5 text-center text-[12px] font-bold text-[var(--rt-muted)]"
              >
                {me.linkedPlayerId ? "Viewing another player" : "Account not linked"}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ================================================================
   AppHeader — Header 1 (Command Bar) ONLY
   - Nav: Home, Ranks (Players menu removed per user request)
   - Month pill with explicit "Today" button when viewing another month
   - Theme dropdown: System / Dark / Light
   - Compact Role dropdown + Admin Collect button + Reset
   ================================================================ */
/* ================================================================
   MonthStepper - Boxy Raid Telemetry month switcher (h-10, 4px radius)
   ================================================================ */
export function MonthStepper({
  monthKey,
  latestMonthKey,
  onChange,
}: {
  monthKey: string
  latestMonthKey: string
  onChange: (nextMonthKey: string) => void
}) {
  const monthLabel = monthTitleFromKey(monthKey)
  const isPast = monthKey < latestMonthKey

  return (
    <div
      role="group"
      aria-label="Month selector"
      className={`inline-flex h-10 shrink-0 items-center overflow-hidden rounded border-2 bg-[var(--rt-surface)] transition-colors ${
        isPast ? "border-[var(--rt-accent)]" : "border-[var(--rt-ui-border)]"
      }`}
    >
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonthKey(monthKey, -1))}
        className="rt2-focus flex h-full w-9 cursor-pointer items-center justify-center border-r border-[var(--rt-border-soft)] text-[var(--rt-ink)] transition-colors hover:bg-[var(--rt-bg)]"
      >
        <CaretLeft size={14} weight="bold" />
      </button>

      {isPast ? (
        <button
          type="button"
          onClick={() => onChange(latestMonthKey)}
          title="Back to latest month"
          aria-label={`${monthLabel}, click to return to latest month`}
          className="rt2-focus group relative flex h-full w-[160px] cursor-pointer items-center justify-center gap-1.5 px-2.5 font-arcade-mono text-[13px] font-bold text-[var(--rt-accent-ink)] transition-colors hover:bg-[var(--rt-accent)] hover:text-[var(--rt-accent-fg)] focus-visible:bg-[var(--rt-accent)] focus-visible:text-[var(--rt-accent-fg)]"
        >
          <span className="inline-flex items-center gap-1.5 transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">
            <CalendarBlank size={14} weight="bold" />
            <span>{monthLabel}</span>
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            Back to Latest
          </span>
        </button>
      ) : (
        <span className="flex h-full w-[160px] items-center justify-center gap-1.5 px-2.5 font-arcade-mono text-[13px] font-bold text-[var(--rt-ink)]">
          <CalendarBlank
            size={14}
            weight="bold"
            className="text-[var(--rt-muted)]"
          />
          <span>{monthLabel}</span>
        </span>
      )}

      <button
        type="button"
        disabled={monthKey >= latestMonthKey}
        title={monthKey >= latestMonthKey ? "No future bills" : "Next month"}
        aria-label="Next month"
        onClick={() => {
          const next = shiftMonthKey(monthKey, 1)
          onChange(next > latestMonthKey ? latestMonthKey : next)
        }}
        className="rt2-focus flex h-full w-9 cursor-pointer items-center justify-center border-l border-[var(--rt-border-soft)] text-[var(--rt-ink)] transition-colors hover:bg-[var(--rt-bg)] disabled:cursor-not-allowed disabled:opacity-35"
      >
        <CaretRight size={14} weight="bold" />
      </button>
    </div>
  )
}

/* ================================================================
   AppHeader - Header 1 (Command bar) with Real Router Links & Better Auth
   ================================================================ */
const loadingQuipClock = createLoadingQuipClock()

export function PageLoading({ label = "Loading..." }: { label?: string }) {
  const store = useOptionalAppStore()
  const iconUrl = store?.branding.iconUrl ?? DEFAULT_BRANDING.iconUrl
  const [quipIndex, setQuipIndex] = useState(() =>
    loadingQuipClock.indexForMount()
  )

  useEffect(() => {
    let timeoutId: number | undefined
    const schedule = (delay: number) => {
      timeoutId = window.setTimeout(() => {
        setQuipIndex(loadingQuipClock.advance())
        schedule(loadingQuipClock.msUntilNext())
      }, delay)
    }
    schedule(loadingQuipClock.markMounted())
    return () => window.clearTimeout(timeoutId)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-[var(--rt-accent)] bg-[var(--rt-surface)] p-3 shadow-lg">
        <img
          src={iconUrl}
          alt={label}
          width={72}
          height={72}
          className="h-18 w-18 animate-pulse rounded object-cover"
        />
      </div>
      <div className="space-y-1">
        <p
          data-testid="loading-quip"
          className="font-arcade-mono text-[15px] font-bold text-[var(--rt-ink)] sm:text-[16px]"
        >
          {LOADING_QUIPS[quipIndex]}
        </p>
        <p className="text-[13px] text-[var(--rt-muted)]">{label}</p>
      </div>
    </div>
  )
}

export function AppHeader({
  themePref,
  onThemePrefChange,
  role,
  onSignIn,
  onSignOut,
}: {
  themePref: ThemePreference
  onThemePrefChange: (pref: ThemePreference) => void
  role: AppUserRole
  onSignIn: () => void
  onSignOut: () => void
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { branding, me, players, you, setActivePlayerId, authPending, signingIn } =
    useAppStore()
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  const isHome = pathname === "/"
  const isBills = pathname.startsWith("/bills") || pathname.startsWith("/b/")
  const isRanks = pathname.startsWith("/ranks")
  const isAdminRoute = pathname.startsWith("/admin")

  const linkedPlayer = me.linkedPlayerId
    ? (players.find((p) => p.id === me.linkedPlayerId) ?? null)
    : null
  const isViewingOther = Boolean(
    isHome && me.linkedPlayerId && you && you.id !== me.linkedPlayerId
  )
  const sortedNavPlayers = [...players].sort((a, b) => {
    const unpaidDiff = getPlayerUnpaidTotal(b) - getPlayerUnpaidTotal(a)
    if (unpaidDiff !== 0) return unpaidDiff
    const countDiff = b.unpaidBills.length - a.unpaidBills.length
    if (countDiff !== 0) return countDiff
    return a.name.localeCompare(b.name)
  })

  return (
    <header className="sticky top-0 z-30 border-b-2 border-[var(--rt-border)] bg-[var(--rt-topbar-bg)] text-[var(--rt-topbar-ink)]">
      <div className="mx-auto flex min-h-[58px] max-w-[1200px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-1.5">
        {/* Left: Brand + Primary Nav (Home, Bills, Ranks, Admin when admin) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-4">
          <Link
            to="/"
            className="rt2-focus inline-flex shrink-0 cursor-pointer items-center gap-2 hover:opacity-90 sm:gap-2.5"
          >
            <img
              src={branding.iconUrl}
              alt={`${branding.appName} icon`}
              width={32}
              height={32}
              className="h-7 w-7 rounded-sm object-cover shadow-xs sm:h-8 sm:w-8"
            />
            <span className="rt2-display text-2xl leading-none font-extrabold tracking-wide sm:text-3xl">
              {branding.appName}
            </span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-0.5 sm:gap-1">
            <Link
              to="/"
              className={`rt2-focus inline-flex min-h-[38px] cursor-pointer items-center rounded-t px-2.5 text-[14px] font-bold transition hover:bg-white/12 hover:text-white sm:min-h-[40px] sm:px-3 sm:text-[15px] ${
                isHome
                  ? "border-b-2 border-[var(--rt-accent)] text-white"
                  : "border-b-2 border-transparent text-[var(--rt-topbar-muted)]"
              }`}
            >
              Home
            </Link>
            <Link
              to="/bills"
              className={`rt2-focus inline-flex min-h-[38px] cursor-pointer items-center rounded-t px-2.5 text-[14px] font-bold transition hover:bg-white/12 hover:text-white sm:min-h-[40px] sm:px-3 sm:text-[15px] ${
                isBills
                  ? "border-b-2 border-[var(--rt-accent)] text-white"
                  : "border-b-2 border-transparent text-[var(--rt-topbar-muted)]"
              }`}
            >
              Bills
            </Link>
            <Link
              to="/ranks"
              className={`rt2-focus inline-flex min-h-[38px] cursor-pointer items-center rounded-t px-2.5 text-[14px] font-bold transition hover:bg-white/12 hover:text-white sm:min-h-[40px] sm:px-3 sm:text-[15px] ${
                isRanks
                  ? "border-b-2 border-[var(--rt-accent)] text-white"
                  : "border-b-2 border-transparent text-[var(--rt-topbar-muted)]"
              }`}
            >
              Ranks
            </Link>
            {role === "admin" && (
              <Link
                to="/admin"
                className={`rt2-focus inline-flex min-h-[38px] cursor-pointer items-center rounded-t px-2.5 text-[14px] font-bold transition hover:bg-white/12 hover:text-white sm:min-h-[40px] sm:px-3 sm:text-[15px] ${
                  isAdminRoute
                    ? "border-b-2 border-[var(--rt-accent)] text-white"
                    : "border-b-2 border-transparent text-[var(--rt-topbar-muted)]"
                }`}
              >
                Admin
              </Link>
            )}
          </nav>
        </div>

        {/* Right: Guest callsign switcher + Collect (admin) + Theme Popover + Auth Account */}
        <div className="relative flex flex-wrap items-center gap-2">
          {!me.authenticated && you && sortedNavPlayers.length > 0 && (
            <Select
              value={you.id}
              onValueChange={(next) => {
                if (typeof next === "string" && next) setActivePlayerId(next)
              }}
            >
              <SelectTrigger
                aria-label="Switch active callsign"
                className="h-[40px] max-w-[180px] border border-white/25 bg-white/8 px-2.5 text-[13px] font-bold text-[var(--rt-topbar-ink)] shadow-none hover:bg-white/15"
              >
                <SelectValue>
                  <span className="flex min-w-0 items-center gap-2">
                    <PlayerAvatar player={you} size="sm" />
                    <span className="truncate">{you.name}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="min-w-[250px]">
                {sortedNavPlayers.map((p) => {
                  const pOwed = getPlayerUnpaidTotal(p)
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <PlayerAvatar player={p} size="sm" />
                          <span className="truncate">{p.name}</span>
                        </span>
                        <span
                          className={`tnum shrink-0 font-arcade-mono text-[12px] font-semibold [[data-selected]_&]:text-current ${
                            pOwed > 0
                              ? "text-[var(--rt-accent-ink)]"
                              : "text-[var(--rt-teal-ink)]"
                          }`}
                        >
                          {pOwed > 0 ? formatRupiah(pOwed) : "Clear"}
                        </span>
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          )}

          {/* Theme Popover: System / Light / Dark */}
          <Popover open={themeMenuOpen} onOpenChange={setThemeMenuOpen}>
            <PopoverTrigger
              aria-label="Appearance theme"
              className="rt2-focus inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded border border-white/25 bg-white/8 px-2.5 text-[14px] font-bold hover:bg-white/15"
            >
              {themePref === "system" && <Monitor size={17} weight="bold" />}
              {themePref === "light" && <Sun size={17} weight="bold" />}
              {themePref === "dark" && <Moon size={17} weight="bold" />}
              <span className="hidden sm:inline">
                {themePref[0].toUpperCase() + themePref.slice(1)}
              </span>
              <CaretDown size={13} weight="bold" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1.5">
              {(
                [
                  { id: "system", label: "System", icon: Monitor },
                  { id: "light", label: "Light", icon: Sun },
                  { id: "dark", label: "Dark", icon: Moon },
                ] as const
              ).map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onThemePrefChange(item.id)
                      setThemeMenuOpen(false)
                    }}
                    className={`rt2-focus flex min-h-[40px] w-full cursor-pointer items-center justify-between rounded px-3 text-left text-[15px] font-bold hover:bg-[var(--rt-bg)] ${
                      themePref === item.id
                        ? "bg-[var(--rt-accent-soft)] text-[var(--rt-accent-ink)]"
                        : ""
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon size={16} weight="bold" />
                      {item.label}
                    </span>
                    {themePref === item.id && <Check size={15} weight="bold" />}
                  </button>
                )
              })}
            </PopoverContent>
          </Popover>

          {/* Better Auth Sign In / Account Popover */}
          {!me.authenticated ? (
            <button
              type="button"
              disabled={authPending || signingIn}
              onClick={onSignIn}
              className="rt2-focus inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded border border-white/25 bg-white/10 px-3 text-[14px] font-bold hover:bg-white/18 disabled:opacity-60"
            >
              <SignIn size={16} weight="bold" />
              <span>{authPending || signingIn ? "Signing in..." : "Sign in"}</span>
            </button>
          ) : (
            <Popover open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
              <PopoverTrigger
                className={`rt2-focus inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded border px-2.5 text-[14px] font-bold ${
                  isViewingOther
                    ? "border-[var(--rt-amber)] bg-[var(--rt-amber)]/15 hover:bg-[var(--rt-amber)]/22"
                    : "border-white/25 bg-white/8 hover:bg-white/15"
                }`}
              >
                {linkedPlayer ? (
                  <PlayerAvatar player={linkedPlayer} size="sm" />
                ) : (
                  <UserCircle size={17} weight="bold" />
                )}
                <span className="max-w-[110px] truncate">
                  {linkedPlayer?.name || me.user?.name || me.user?.email}
                </span>
                {isViewingOther && you && (
                  <span className="hidden rounded bg-[var(--rt-amber)] px-1.5 py-0.5 font-arcade-mono text-[11px] font-bold text-[#12161B] sm:inline">
                    Viewing {you.name}
                  </span>
                )}
                {me.isAdmin && !isViewingOther && (
                  <span className="rounded bg-[var(--rt-accent)] px-1.5 py-0.5 font-arcade-mono text-[11px] font-bold text-[var(--rt-accent-fg)]">
                    Admin
                  </span>
                )}
                <CaretDown size={13} weight="bold" />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-2.5">
                <div className="border-b border-[var(--rt-border-soft)] px-1.5 pb-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[14px] font-bold">
                      {me.user?.name}
                    </p>
                    {me.isAdmin && (
                      <span className="shrink-0 rounded bg-[var(--rt-accent)] px-1.5 py-0.5 font-arcade-mono text-[10px] font-bold text-[var(--rt-accent-fg)]">
                        Admin
                      </span>
                    )}
                  </div>
                  <p className="truncate font-arcade-mono text-[12px] text-[var(--rt-muted)]">
                    {me.user?.email}
                  </p>
                </div>

                {/* Viewing as callsign switcher inside the account menu (Home only) */}
                {isHome && you && sortedNavPlayers.length > 0 && (
                  <div className="border-b border-[var(--rt-border-soft)] px-1.5 py-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold tracking-wide text-[var(--rt-muted)] uppercase">
                        Viewing as
                      </span>
                      {isViewingOther && me.linkedPlayerId && (
                        <button
                          type="button"
                          onClick={() => setActivePlayerId(me.linkedPlayerId!)}
                          className="rt2-focus cursor-pointer font-arcade-mono text-[11px] font-bold text-[var(--rt-accent-ink)] hover:underline"
                        >
                          Back to me
                        </button>
                      )}
                    </div>
                    <Select
                      value={you.id}
                      onValueChange={(next) => {
                        if (typeof next === "string" && next) {
                          setActivePlayerId(next)
                        }
                      }}
                    >
                      <SelectTrigger
                        aria-label="Viewing as callsign"
                        className="h-10 w-full px-2.5 text-[13px]"
                      >
                        <SelectValue>
                          <span className="flex min-w-0 items-center gap-2">
                            <PlayerAvatar player={you} size="sm" />
                            <span className="truncate">{you.name}</span>
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="end" className="min-w-[248px]">
                        {sortedNavPlayers.map((p) => {
                          const pOwed = getPlayerUnpaidTotal(p)
                          const isSelf = me.linkedPlayerId === p.id
                          return (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="flex w-full items-center justify-between gap-3">
                                <span className="flex min-w-0 items-center gap-2">
                                  <PlayerAvatar player={p} size="sm" />
                                  <span className="truncate">{p.name}</span>
                                  {isSelf && (
                                    <span className="rounded bg-[var(--rt-accent-soft)] px-1 py-0.5 font-arcade-mono text-[10px] font-bold text-[var(--rt-accent-ink)] uppercase [[data-selected]_&]:bg-black/20 [[data-selected]_&]:text-current">
                                      You
                                    </span>
                                  )}
                                </span>
                                <span
                                  className={`tnum shrink-0 font-arcade-mono text-[12px] font-semibold [[data-selected]_&]:text-current ${
                                    pOwed > 0
                                      ? "text-[var(--rt-accent-ink)]"
                                      : "text-[var(--rt-teal-ink)]"
                                  }`}
                                >
                                  {pOwed > 0 ? formatRupiah(pOwed) : "Clear"}
                                </span>
                              </span>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="mt-1.5 space-y-1">
                  {me.linkedPlayerId && (
                    <Link
                      to="/players/$playerId"
                      params={{ playerId: me.linkedPlayerId }}
                      onClick={() => setAccountMenuOpen(false)}
                      className="rt2-focus flex min-h-[38px] w-full items-center gap-2 rounded px-2.5 text-[14px] font-bold hover:bg-[var(--rt-bg)]"
                    >
                      <UserCircle size={16} weight="bold" />
                      My dossier
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false)
                      onSignOut()
                    }}
                    className="rt2-focus flex min-h-[38px] w-full cursor-pointer items-center gap-2 rounded px-2.5 text-left text-[14px] font-bold text-[var(--rt-accent-ink)] hover:bg-[var(--rt-bg)]"
                  >
                    <SignOut size={16} weight="bold" />
                    Sign out
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </header>
  )
}

/* ================================================================
   AdminCollectDrawer — Smooth Open & Close Slide Animation
   ================================================================ */
export function AdminCollectDrawer({
  open,
  onClose,
  debtors,
  totalOutstanding,
  pendingCount,
  onConfirm,
  onRejectClaim,
}: {
  open: boolean
  onClose: () => void
  debtors: PlayerSummary[]
  totalOutstanding: number
  pendingCount: number
  onConfirm: (debtor: PlayerSummary, receivedAmount: number) => void | Promise<boolean>
  onRejectClaim: (debtor: PlayerSummary) => void | Promise<boolean>
}) {
  const [receivedById, setReceivedById] = useState<Record<string, number>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const initial: Record<string, number> = {}
    for (const d of debtors) {
      initial[d.id] = d.pendingClaim?.claimedAmount ?? getPlayerUnpaidTotal(d)
    }
    setReceivedById(initial)
  }, [debtors.map((d) => `${d.id}:${d.pendingClaim?.claimedAmount ?? 0}:${getPlayerUnpaidTotal(d)}`).join(",")])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <div className="flex items-center justify-between border-b-2 border-[var(--rt-border)] pb-3.5">
          <div>
            <DialogTitle>Admin Collect All</DialogTitle>
            <p className="tnum font-arcade-mono text-[16px] text-[var(--rt-muted)]">
              Open {formatRupiah(totalOutstanding)} | {pendingCount} pending
            </p>
          </div>
          <DialogClose
            aria-label="Close Collect All drawer"
            className="rt2-focus rt2-btn-secondary flex h-11 w-11 items-center justify-center rounded"
          >
            <X size={20} weight="bold" />
          </DialogClose>
        </div>

        <div className="rt2-scroll-fade-y mt-2 flex-1 space-y-4 overflow-y-auto py-3">
          {debtors.length === 0 ? (
            <p className="py-10 text-center text-[16px] font-bold text-[var(--rt-teal-ink)]">
              Every player is settled up.
            </p>
          ) : (
            debtors.map((d) => {
              const dOwed = getPlayerUnpaidTotal(d)
              const claimed = d.pendingClaim?.claimedAmount
              const received = receivedById[d.id] ?? claimed ?? dOwed
              const diff = received - dOwed
              const isShort = diff < 0

              return (
                <div
                  key={d.id}
                  className="space-y-3 rounded border-2 border-[var(--rt-border)] bg-[var(--rt-surface-alt)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar player={d} size="md" />
                      <div>
                        <p className="text-[17px] font-bold">{d.name}</p>
                        <p className="tnum font-arcade-mono text-[14px] text-[var(--rt-muted)]">
                          Owes {formatRupiah(dOwed)} ({d.unpaidBills.length} bills)
                        </p>
                      </div>
                    </div>
                    {claimed !== undefined && (
                      <span className="tnum rounded border border-[var(--rt-amber)] bg-[var(--rt-amber-soft)] px-2.5 py-1 font-arcade-mono text-[14px] font-bold text-[var(--rt-amber-ink)]">
                        Claimed {formatRupiah(claimed)} ({d.pendingClaim?.submittedAt})
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {claimed !== undefined && (
                      <button
                        type="button"
                        aria-pressed={received === claimed}
                        onClick={() =>
                          setReceivedById((prev) => ({ ...prev, [d.id]: claimed }))
                        }
                        className={`rt2-focus min-h-[44px] cursor-pointer rounded border-2 px-3 text-[14px] font-bold ${
                          received === claimed
                            ? "border-[var(--rt-ink)] bg-[var(--rt-ink)] text-[var(--rt-surface)]"
                            : "rt2-btn-secondary"
                        }`}
                      >
                        Claimed {formatRupiah(claimed)}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-pressed={received === dOwed}
                      onClick={() =>
                        setReceivedById((prev) => ({ ...prev, [d.id]: dOwed }))
                      }
                      className={`rt2-focus min-h-[44px] cursor-pointer rounded border-2 px-3 text-[14px] font-bold ${
                        received === dOwed
                          ? "border-[var(--rt-ink)] bg-[var(--rt-ink)] text-[var(--rt-surface)]"
                          : "rt2-btn-secondary"
                      }`}
                    >
                      Exact {formatRupiah(dOwed)}
                    </button>
                  </div>

                  <CurrencyInput
                    label="Received amount"
                    value={received}
                    onChange={(val) =>
                      setReceivedById((prev) => ({ ...prev, [d.id]: val }))
                    }
                    onEnter={() => onConfirm(d, received)}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rt-border-soft)] pt-3">
                    <span className="tnum inline-flex items-center gap-1.5 font-arcade-mono text-[15px] font-bold">
                      {diff > 0 && (
                        <>
                          <Plus size={15} weight="bold" className="text-[var(--rt-teal-ink)]" />
                          <span className="text-[var(--rt-teal-ink)]">
                            {formatRupiah(diff)} tip
                          </span>
                        </>
                      )}
                      {diff === 0 && (
                        <span className="text-[var(--rt-muted)]">Exact</span>
                      )}
                      {isShort && (
                        <>
                          <Warning size={16} weight="bold" className="text-[var(--rt-accent-ink)]" />
                          <span className="text-[var(--rt-accent-ink)]">
                            Short {formatRupiah(Math.abs(diff))}
                          </span>
                        </>
                      )}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      {claimed !== undefined && (
                        <button
                          type="button"
                          disabled={busyId === d.id}
                          onClick={async () => {
                            setBusyId(d.id)
                            try {
                              await onRejectClaim(d)
                            } finally {
                              setBusyId(null)
                            }
                          }}
                          className="rt2-focus rt2-btn-danger min-h-[44px] rounded px-3.5 text-[14px] font-bold disabled:opacity-50"
                        >
                          Reject claim
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={received <= 0 || busyId === d.id}
                        onClick={async () => {
                          setBusyId(d.id)
                          try {
                            await onConfirm(d, received)
                          } finally {
                            setBusyId(null)
                          }
                        }}
                        className={`rt2-focus min-h-[44px] rounded px-4 text-[15px] font-bold disabled:opacity-50 ${
                          isShort ? "rt2-btn-secondary" : "rt2-btn-primary"
                        }`}
                      >
                        {busyId === d.id
                          ? "Confirming..."
                          : isShort
                            ? "Confirm short payment"
                            : "Confirm payment"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Dialog>
  )
}

/* ================================================================
   SegmentedTabs — Built on shadcn / Base UI Tabs + gliding Indicator
   ================================================================ */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<{ id: T; label: string }>
  value: T
  onChange: (next: T) => void
  ariaLabel: string
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next as T)
      }}
    >
      <TabsList aria-label={ariaLabel}>
        {options.map((opt) => (
          <TabsTrigger key={opt.id} value={opt.id}>
            {opt.label}
          </TabsTrigger>
        ))}
        <TabsIndicator />
      </TabsList>
    </Tabs>
  )
}

/* ================================================================
   SelectMenu — Built on shadcn / Base UI Select
   ================================================================ */
export function SelectMenu<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  prefix,
  minWidthClass = "min-w-[150px]",
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (next: T) => void
  ariaLabel: string
  prefix?: string
  minWidthClass?: string
}) {
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next as T)
      }}
    >
      <SelectTrigger aria-label={ariaLabel} className={minWidthClass}>
        <SelectValue>
          {prefix ? (
            <span className="font-semibold text-[var(--rt-muted)]">
              {prefix}{" "}
            </span>
          ) : null}
          {current?.label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* ================================================================
   Hero View-Transition helper (Flutter-like shared element morph)
   ================================================================ */
export function prepareHeroPlayerTransition(
  container: HTMLElement | null
): void {
  if (typeof document === "undefined" || !container) return
  for (const el of document.querySelectorAll<HTMLElement>(
    "[data-hero-active='true']"
  )) {
    el.style.viewTransitionName = ""
    el.removeAttribute("data-hero-active")
  }
  const avatar = container.querySelector<HTMLElement>("[data-hero-avatar]")
  const name = container.querySelector<HTMLElement>("[data-hero-name]")
  if (avatar) {
    avatar.style.viewTransitionName = "hero-player-avatar"
    avatar.setAttribute("data-hero-active", "true")
  }
  if (name) {
    name.style.viewTransitionName = "hero-player-name"
    name.setAttribute("data-hero-active", "true")
  }
}
