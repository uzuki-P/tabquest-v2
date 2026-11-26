export const LOADING_QUIPS = [
  "Splitting the delivery fee to the last rupiah...",
  "Calculating who ordered the extra nasi...",
  "Summoning the lunch raid boss...",
  "Rounding up for the tip jar...",
  "Tracking down unpaid squadmates...",
  "Negotiating with the promo voucher...",
  "Charging up the HP bar...",
  "Checking who holds #1 on the Tip Rank...",
  "Polishing the receipt for OCR...",
  "Assigning leftover Rp1 to the rounding hero...",
  "Counting change in the office tip jar...",
  "Preparing your lunch dossier...",
]

export const LOADING_QUIP_INTERVAL_MS = 4500
const MIN_TIMER_DELAY_MS = 250

/**
 * Shared quip rotation state for every `PageLoading` instance.
 *
 * Navigation swaps one `PageLoading` for another (route-pending shell, then the
 * page's own data-loading state), so keeping the active quip outside React
 * state stops each remount from resetting the rotation.
 */
export interface LoadingQuipClock {
  /** Quip index for a newly mounted `PageLoading` (call from `useState`). */
  indexForMount(): number
  /** Call once mounted on the client. Returns ms until the next rotation. */
  markMounted(): number
  /** Rotates to a new quip. Returns the new index. */
  advance(): number
  /** Ms until the active quip has been shown for the full interval. */
  msUntilNext(): number
}

export function createLoadingQuipClock({
  count = LOADING_QUIPS.length,
  intervalMs = LOADING_QUIP_INTERVAL_MS,
  now = Date.now,
  random = Math.random,
}: {
  count?: number
  intervalMs?: number
  now?: () => number
  random?: () => number
} = {}): LoadingQuipClock {
  let hydrated = false
  let index = 0
  let changedAt = 0

  const pickNext = () => {
    if (count <= 1) return 0
    const next = Math.floor(random() * count)
    return next === index ? (next + 1) % count : next
  }

  const msUntilNext = () =>
    Math.max(MIN_TIMER_DELAY_MS, intervalMs - (now() - changedAt))

  return {
    indexForMount() {
      // Before the first client mount, stay deterministic so SSR markup and
      // hydration agree.
      if (!hydrated) return index
      const t = now()
      if (changedAt === 0 || t - changedAt >= intervalMs) {
        index = pickNext()
        changedAt = t
      }
      return index
    },
    markMounted() {
      hydrated = true
      if (changedAt === 0) changedAt = now()
      return msUntilNext()
    },
    advance() {
      index = pickNext()
      changedAt = now()
      return index
    },
    msUntilNext,
  }
}
