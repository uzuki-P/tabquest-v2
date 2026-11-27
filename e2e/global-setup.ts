import { chromium } from "@playwright/test"
import type { FullConfig } from "@playwright/test"

import { DETAIL_BILL, DOSSIER_PLAYER, EDITABLE_BILL, mockApi } from "./support/api"

const ROUTES = [
  "/",
  "/bills",
  "/ranks",
  `/b/${DETAIL_BILL.publicId}`,
  `/players/${DOSSIER_PLAYER.id}`,
  "/admin",
  "/admin/players",
  "/admin/settings",
  "/admin/bills/new",
  `/admin/bills/${EDITABLE_BILL.id}/edit`,
]

/**
 * Vite's dev server discovers and optimizes dependencies on first visit and
 * then forces a full reload, which breaks whichever tests run first. Visit
 * every route once (as admin, so admin modules load too) before testing.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL
  const browser = await chromium.launch()
  try {
    let needsSecondPass = false
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1 && !needsSecondPass) break
      const page = await browser.newPage({ baseURL })
      let mainNavigations = 0
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) mainNavigations++
      })
      await mockApi(page, { as: "admin" })
      for (const route of ROUTES) {
        const before = mainNavigations
        await page.goto(route, { waitUntil: "load", timeout: 120_000 })
        // Let in-flight data requests finish so the next navigation doesn't abort them.
        await page
          .waitForFunction(
            () =>
              document.documentElement.dataset.hydrated === "true" &&
              !document.querySelector('[data-testid="loading-quip"]'),
            null,
            { timeout: 30_000 }
          )
          .catch(() => {})
        if (pass === 0 && mainNavigations > before + 1) {
          needsSecondPass = true
        }
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
