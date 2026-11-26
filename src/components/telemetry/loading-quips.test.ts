import { describe, expect, it } from "bun:test"

import { createLoadingQuipClock } from "./loading-quips"

function setup() {
  let t = 1_000_000
  let r = 0
  const clock = createLoadingQuipClock({
    count: 12,
    intervalMs: 4500,
    now: () => t,
    // Cycle through distinct indices so every rotation is observable.
    random: () => {
      r = (r + 5) % 12
      return r / 12
    },
  })
  return {
    clock,
    tick(ms: number) {
      t += ms
    },
  }
}

describe("loading quip clock", () => {
  it("is deterministic before the first client mount (SSR/hydration)", () => {
    const { clock } = setup()
    expect(clock.indexForMount()).toBe(0)
    expect(clock.indexForMount()).toBe(0)
  })

  it("waits the full interval after mount before rotating", () => {
    const { clock } = setup()
    clock.indexForMount()
    expect(clock.markMounted()).toBe(4500)
  })

  it("keeps the same quip when PageLoading remounts within the interval", () => {
    const { clock, tick } = setup()
    const first = clock.indexForMount()
    clock.markMounted()

    // Route-pending shell unmounts, page data-loading state mounts.
    tick(500)
    expect(clock.indexForMount()).toBe(first)
    expect(clock.markMounted()).toBe(4000)

    tick(1500)
    expect(clock.indexForMount()).toBe(first)
    expect(clock.msUntilNext()).toBe(2500)
  })

  it("rotates to a different quip on advance and restarts the interval", () => {
    const { clock, tick } = setup()
    const first = clock.indexForMount()
    clock.markMounted()
    tick(4500)
    const next = clock.advance()
    expect(next).not.toBe(first)
    expect(clock.msUntilNext()).toBe(4500)
    tick(200)
    expect(clock.indexForMount()).toBe(next)
  })

  it("picks a fresh quip for a mount after the interval has passed", () => {
    const { clock, tick } = setup()
    const first = clock.indexForMount()
    clock.markMounted()
    tick(6000)
    const later = clock.indexForMount()
    expect(later).not.toBe(first)
    expect(clock.markMounted()).toBe(4500)
  })

  it("never returns the same index twice in a row even if random repeats", () => {
    const clock = createLoadingQuipClock({
      count: 3,
      now: () => 0,
      random: () => 0,
    })
    clock.markMounted()
    expect(clock.advance()).toBe(1)
  })
})
