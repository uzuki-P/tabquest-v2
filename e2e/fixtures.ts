import type { Page, Route } from "@playwright/test"

import type {
  HomeFeedResponse,
  MeResponse,
  PlayerSummary,
  PublicAppSettings,
} from "../src/domain/types"

export const FIXTURE_PLAYER: PlayerSummary = {
  id: "e2e-player",
  name: "E2E Raider",
  handle: "e2e",
  avatar: "ER",
  avatarUrl: null,
  avatarBanned: false,
  nameLocked: false,
  guildTitle: "Tester",
  level: 1,
  monthlySpend: 0,
  monthlyTips: 0,
  ordersCount: 0,
  tippedBillsCount: 0,
  savedDiscount: 0,
  savedPct: 0,
  badge: null,
  bestTipNote: "",
  linkedEmail: null,
  userId: null,
  archivedAt: null,
  takesRounding: false,
  unpaidBills: [],
  pendingClaim: null,
}

const HOME: HomeFeedResponse = {
  month: "2026-11",
  availableMonths: ["2026-11"],
  players: [FIXTURE_PLAYER],
  bills: [],
  unpaidBills: [],
  totals: {
    totalBilled: 0,
    totalTipPot: 0,
    tippersCount: 0,
    totalOutstanding: 0,
    openDebtorsCount: 0,
  },
}

const SETTINGS: PublicAppSettings = {
  appName: "Tabquest",
  tagline: "E2E",
  iconUrl: "/favicon.png",
}

const GUEST_ME: MeResponse = {
  authenticated: false,
  user: null,
  isAdmin: false,
  linkedPlayerId: null,
  paymentMethods: [],
}

export function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

/**
 * Serves every `/api/*` call from fixtures so E2E never touches D1 and runs on
 * a fresh checkout without migrations or seed data. Anything not mocked gets a
 * 404 instead of reaching the dev server.
 */
export async function mockApi(page: Page) {
  // Playwright tries the most recently registered route first, so the
  // catch-all goes in first.
  await page.route("**/api/**", (route) =>
    json(route, { error: "not mocked in e2e" }, 404)
  )
  await page.route("**/api/auth/get-session*", (route) => json(route, null))
  await page.route("**/api/me", (route) => json(route, GUEST_ME))
  await page.route("**/api/public/settings", (route) => json(route, SETTINGS))
  await page.route(/\/api\/public\/home(\?|$)/, (route) => json(route, HOME))
}
