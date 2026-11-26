import type { Page } from "@playwright/test"

import { DOSSIER_PLAYER } from "./support/api"
import { expect, test } from "./support/test"

// Mirrors LOADING_QUIP_INTERVAL_MS (4500ms) with slack for timer jitter.
const MIN_QUIP_GAP_MS = 4000
const API_DELAY_MS = 9000

interface QuipSample {
  t: number
  quip: string | null
  label: string | null
}

declare global {
  interface Window {
    __quipLog: QuipSample[]
  }
}

/**
 * Records every change of the loading quip (including PageLoading remounts)
 * from the very first paint, before React hydrates.
 */
async function recordQuips(page: Page) {
  await page.addInitScript(() => {
    window.__quipLog = []
    let last: string | null = null
    let lastLabel: string | null = null
    const sample = () => {
      const el = document.querySelector('[data-testid="loading-quip"]')
      const quip = el?.textContent ?? null
      const label = el?.nextElementSibling?.textContent ?? null
      if (quip !== last || label !== lastLabel) {
        last = quip
        lastLabel = label
        window.__quipLog.push({ t: performance.now(), quip, label })
      }
      requestAnimationFrame(sample)
    }
    sample()
  })
}

/** Quip runs: each distinct quip and when it first appeared, ignoring gaps where no PageLoading is mounted. */
function quipRuns(log: QuipSample[]) {
  const runs: { quip: string; t: number }[] = []
  for (const s of log) {
    if (s.quip === null) continue
    if (runs.at(-1)?.quip !== s.quip) runs.push({ quip: s.quip, t: s.t })
  }
  return runs
}

function tooFastChanges(log: QuipSample[]) {
  const runs = quipRuns(log)
  const out: string[] = []
  for (let i = 1; i < runs.length; i++) {
    const gap = runs[i].t - runs[i - 1].t
    if (gap < MIN_QUIP_GAP_MS) {
      out.push(`${Math.round(gap)}ms: "${runs[i - 1].quip}" -> "${runs[i].quip}"`)
    }
  }
  return out
}

test.describe("slow home data", () => {
  test.use({ api: { delays: [{ match: /^\/api\/public\/home/, ms: API_DELAY_MS }] } })

  test("loading quip stays put through SSR, hydration and slow data", async ({
    page,
  }) => {
    await recordQuips(page)
    await page.goto("/")
    await expect(page.getByTestId("loading-quip")).toBeVisible()
    // The delayed fetch only starts after hydration, which is slow in dev.
    await expect(page.getByTestId("loading-quip")).toBeHidden({
      timeout: API_DELAY_MS + 30_000,
    })

    const log = await page.evaluate(() => window.__quipLog)
    const runs = quipRuns(log)
    const shown = log.filter((s) => s.quip !== null)
    const loadingMs = shown.at(-1)!.t - shown[0].t
    // At least 9s of loading at 4.5s per quip: it should rotate, but no more
    // often than the interval allows.
    expect(runs.length).toBeGreaterThanOrEqual(2)
    expect(runs.length).toBeLessThanOrEqual(Math.floor(loadingMs / MIN_QUIP_GAP_MS) + 1)
    expect(tooFastChanges(log)).toEqual([])
  })
})

test.describe("slow player data", () => {
  // Player detail arrives late, so navigation goes route-pending shell -> the
  // page's own "Loading dossier..." state.
  test.use({
    api: {
      delays: [{ match: /^\/api\/public\/players\/[^/]+$/, ms: API_DELAY_MS }],
    },
  })

  test("loading quip does not reset when PageLoading remounts during navigation", async ({
    page,
  }) => {
    await recordQuips(page)
    await page.addInitScript((id) => {
      localStorage.setItem("tq-selected-player", id)
    }, DOSSIER_PLAYER.id)
    await page.goto("/")

    const playerLink = page.getByRole("link", {
      name: `Open ${DOSSIER_PLAYER.name}’s dossier`,
    })
    await expect(playerLink).toBeVisible({ timeout: 20_000 })
    await playerLink.click()

    await expect(page.getByText("Loading dossier...")).toBeVisible()
    await expect(page.getByTestId("loading-quip")).toBeHidden({
      timeout: API_DELAY_MS + 30_000,
    })

    const log = await page.evaluate(() => window.__quipLog)
    expect(log.some((s) => s.label === "Loading dossier...")).toBe(true)
    expect(tooFastChanges(log)).toEqual([])
  })
})
