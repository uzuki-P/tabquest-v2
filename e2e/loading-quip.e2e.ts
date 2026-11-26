import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import { FIXTURE_PLAYER, mockApi, wait } from "./fixtures"

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

test("loading quip stays put through SSR, hydration and slow data", async ({
  page,
}) => {
  await recordQuips(page)
  await mockApi(page)
  await page.route(/\/api\/public\/home(\?|$)/, async (route) => {
    await wait(API_DELAY_MS)
    await route.fallback()
  })

  await page.goto("/")
  await expect(page.getByTestId("loading-quip")).toBeVisible()
  await expect(page.getByTestId("loading-quip")).toBeHidden({
    timeout: API_DELAY_MS + 10_000,
  })

  const log = await page.evaluate(() => window.__quipLog)
  const runs = quipRuns(log)
  // ~9s of loading at 4.5s per quip: it should rotate, but only a couple times.
  expect(runs.length).toBeGreaterThanOrEqual(2)
  expect(runs.length).toBeLessThanOrEqual(3)
  expect(tooFastChanges(log)).toEqual([])
})

test("loading quip does not reset when PageLoading remounts during navigation", async ({
  page,
}) => {
  await recordQuips(page)
  await mockApi(page)
  // Player detail arrives late, so navigation goes route-pending shell ->
  // the page's own "Loading dossier..." state. Its content is irrelevant here,
  // so a delayed 404 (the "not found" view) ends the loading state.
  await page.route(
    `**/api/public/players/${FIXTURE_PLAYER.id}`,
    async (route) => {
      await wait(API_DELAY_MS)
      await route.fulfill({ status: 404, body: "" })
    }
  )
  await page.goto("/")

  const playerLink = page.locator(`a[href="/players/${FIXTURE_PLAYER.id}"]`)
  await expect(playerLink.first()).toBeVisible({ timeout: 20_000 })
  await playerLink.first().click()

  await expect(page.getByText("Loading dossier...")).toBeVisible()
  await expect(page.getByTestId("loading-quip")).toBeHidden({
    timeout: API_DELAY_MS + 10_000,
  })

  const log = await page.evaluate(() => window.__quipLog)
  expect(log.some((s) => s.label === "Loading dossier...")).toBe(true)
  expect(tooFastChanges(log)).toEqual([])
})
