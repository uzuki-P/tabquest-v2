import { test as base, expect } from "@playwright/test"
import type { Page } from "@playwright/test"

import { mockApi } from "./api"
import type { ApiMock, MockOptions } from "./api"

export { expect }

interface Fixtures {
  /** Options for the API mock; override with `test.use({ api: { as: "admin" } })`. */
  api: MockOptions
  /** The installed API mock (records mutations). */
  mock: ApiMock
  /** Console/page errors matching these are expected and do not fail the test. */
  allowedErrors: RegExp[]
}

/**
 * Every test gets the API mock installed and fails if the page logs an
 * unexpected console error or throws an uncaught exception.
 */
export const test = base.extend<Fixtures>({
  api: [{}, { option: true }],
  allowedErrors: [[], { option: true }],
  mock: [
    async ({ page, api, allowedErrors }, use) => {
      const errors: string[] = []
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`console: ${msg.text()}`)
      })
      const mock = await mockApi(page, api)
      await use(mock)
      const unexpected = errors.filter((e) => !allowedErrors.some((re) => re.test(e)))
      expect(unexpected, "unexpected console/page errors").toEqual([])
    },
    { auto: true },
  ],
})

/** Waits until the page has hydrated and no PageLoading is mounted. */
export async function waitForLoaded(page: Page) {
  // Server HTML is visible before React hydrates; clicks before that are lost.
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true", { timeout: 30_000 })
  try {
    await expect(page.getByTestId("loading-quip")).toHaveCount(0, { timeout: 15_000 })
  } catch (err) {
    const where = await page.evaluate(() => {
      const chain: string[] = []
      let el: Element | null = document.querySelector('[data-testid="loading-quip"]')
      while (el && chain.length < 10) {
        const cs = getComputedStyle(el)
        chain.push(
          `${el.tagName}.${(el.getAttribute("class") ?? "").slice(0, 50)} display=${cs.display} vis=${cs.visibility} op=${cs.opacity} aria-hidden=${el.getAttribute("aria-hidden")} inert=${el.hasAttribute("inert")}`
        )
        el = el.parentElement
      }
      return chain.join("\n  < ")
    })
    throw new Error(`PageLoading still mounted:\n  ${where}\n${String(err)}`)
  }
}

/** Fails if the document scrolls horizontally (UI rule 2). */
export async function expectNoHorizontalOverflow(page: Page) {
  await waitForFiniteAnimations(page)
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth, "page should not scroll horizontally").toBeLessThanOrEqual(clientWidth)
}

/** Waits for enter/slide animations (not infinite ones like pulses) to finish. */
export async function waitForFiniteAnimations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== "running" ||
          a.effect?.getTiming().iterations === Infinity
      )
  )
}
