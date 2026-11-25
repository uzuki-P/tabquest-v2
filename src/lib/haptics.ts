/**
 * Subtle tactile feedback on touch devices via the Web Vibration API.
 * Safe no-op on desktop, unsupported browsers (such as iOS Safari),
 * or when the user prefers reduced motion.
 */
export function triggerHaptic(pattern: number | number[] = 10): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return
  if (typeof navigator.vibrate !== "function") return
  if (!window.matchMedia("(pointer: coarse)").matches) return
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Ignore browser blocks (e.g. before a user gesture)
  }
}
