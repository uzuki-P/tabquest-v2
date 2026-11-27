import type { Page, Request, Route } from "@playwright/test"

import type { BillEditorInitialData } from "../../src/components/admin/BillEditor"
import type {
  AdminUserSummary,
  BillSummary,
  HomeFeedResponse,
  MeResponse,
  PaymentMethod,
  PlayerDetailResponse,
  PublicAppSettings,
  RanksResponse,
} from "../../src/domain/types"
import raw from "../fixtures/data.json" with { type: "json" }

/**
 * Anonymized snapshot of real API responses (see e2e/README.md). Typed here so
 * a change to the API types surfaces as a typecheck error in the fixtures.
 */
interface FixtureData {
  home: Record<string, HomeFeedResponse>
  settings: PublicAppSettings
  ranks: Record<"monthly" | "all-time", RanksResponse>
  players: Record<string, PlayerDetailResponse>
  bills: Record<string, { bill: BillSummary } & Record<string, unknown>>
  adminBills: {
    active: BillSummary[]
    drafts: BillSummary[]
    archived: BillSummary[]
  }
  adminPlayers: { players: Record<string, unknown>[]; users: AdminUserSummary[] }
  adminSettings: {
    branding: PublicAppSettings
    paymentMethods: PaymentMethod[]
    updatedAt: string | null
    updatedBy: string | null
  }
  adminMe: MeResponse
  /** GET /api/admin/bills/:billId (bill editor input), keyed by bill id. */
  adminBillDetails: Record<string, BillEditorInitialData>
}

export const data = raw as unknown as FixtureData

export const LATEST_MONTH = Object.keys(data.home).sort().at(-1)!
export const PREVIOUS_MONTH = Object.keys(data.home).sort().at(-2)!
export const latestHome = data.home[LATEST_MONTH]

/** A player with a full dossier fixture and at least one unpaid bill. */
export const DOSSIER_PLAYER = Object.values(data.players).find(
  (p) => p.player.unpaidBills.length > 0
)!.player
/** An active bill with an editor fixture (GET /api/admin/bills/:billId). */
export const EDITABLE_BILL = data.adminBills.active.find((b) => data.adminBillDetails[b.id])!

/** A published bill with a detail fixture. */
export const DETAIL_BILL = data.bills[Object.keys(data.bills)[0]].bill

const DRAFT_BILL: BillSummary = {
  ...data.adminBills.active[0],
  id: "e2e-draft-bill",
  publicId: "e2e-draft-bill",
  merchant: "E2E Draft Kitchen",
  status: "draft",
}
const ARCHIVED_BILL: BillSummary = {
  ...data.adminBills.active.at(-1)!,
  id: "e2e-archived-bill",
  publicId: "e2e-archived-bill",
  merchant: "E2E Archived Cafe",
  archivedAt: "2026-11-01T00:00:00.000Z",
}

export const GUEST_ME: MeResponse = {
  authenticated: false,
  user: null,
  isAdmin: false,
  linkedPlayerId: null,
  paymentMethods: [],
}

// 1x1 PNG served for avatars, receipts and stickers.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
)

export interface ApiMock {
  /** Non-GET API calls the page made, in order. */
  mutations: { method: string; path: string; body: unknown }[]
}

export interface MockOptions {
  as?: "guest" | "admin" | "unlinked"
  /** Extra milliseconds before answering requests whose path matches. */
  delays?: { match: RegExp; ms: number }[]
}

/** Success replies shaped like the real API for mutations whose response the UI reads. */
function mutationResponse(method: string, path: string, body: unknown): unknown {
  const b = (body ?? {}) as Record<string, unknown>
  if (path === "/api/admin/settings" && method === "PUT") {
    return {
      branding: {
        appName: (b.appName as string | undefined) ?? data.adminSettings.branding.appName,
        tagline: (b.tagline as string | undefined) ?? data.adminSettings.branding.tagline,
        iconUrl: (b.iconUrl as string | undefined) ?? data.adminSettings.branding.iconUrl,
      },
      paymentMethods: (b.paymentMethods as PaymentMethod[] | undefined) ?? data.adminSettings.paymentMethods,
    }
  }
  if (path === "/api/admin/bills" && method === "POST") {
    return {
      id: "e2e-new-bill",
      publicId: "e2e-new-bill",
      status: b.publish ? "published" : "draft",
      finalTotal: 0,
    }
  }
  const billMatch = path.match(/^\/api\/admin\/bills\/([^/]+)$/)
  if (billMatch && method === "PATCH") {
    const id = decodeURIComponent(billMatch[1])
    const existing = data.adminBillDetails[id]?.bill ?? data.adminBills.active.find((x) => x.id === id)
    return {
      id,
      publicId: existing?.publicId ?? id,
      status: b.publish || existing?.status === "published" ? "published" : "draft",
      finalTotal: 0,
    }
  }
  if (path.startsWith("/api/admin/users/") && method === "DELETE") {
    return { deletedUserId: path.split("/").at(-1), email: "removed@example.com" }
  }
  if (path === "/api/me/avatar" && method === "POST") {
    return { avatarUrl: "/api/public/players/e2e/avatar" }
  }
  if (path === "/api/me/link-player" && method === "POST") {
    const playerId = String(b.playerId ?? "")
    const found = latestHome.players.find((p) => p.id === playerId)
    return {
      linkedPlayerId: playerId,
      playerName: found?.name ?? "Player",
    }
  }
  return { ok: true }
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

function bodyOf(req: Request): unknown {
  const text = req.postData()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Serves every `/api/*` call from the fixture snapshot so E2E never touches
 * D1 and runs on a fresh checkout. Mutations are recorded and answered with a
 * success response; anything unknown gets a 404 so new calls are noticed.
 */
export async function mockApi(
  page: Page,
  { as = "guest", delays = [] }: MockOptions = {}
): Promise<ApiMock> {
  const mock: ApiMock = { mutations: [] }
  const me: MeResponse =
    as === "admin"
      ? { ...data.adminMe }
      : as === "unlinked"
        ? {
            authenticated: true,
            user: {
              id: "e2e-unlinked-user",
              name: "New Friend",
              email: "new.friend@example.com",
              image: null,
              role: "user",
            },
            isAdmin: false,
            linkedPlayerId: null,
            paymentMethods: data.adminMe.paymentMethods,
          }
        : GUEST_ME

  await page.route("**/api/**", async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const method = req.method()

    for (const d of delays) {
      if (d.match.test(path + url.search)) {
        await new Promise((r) => setTimeout(r, d.ms))
      }
    }

    // Images: avatars, receipts, uploaded receipt objects.
    if (
      method === "GET" &&
      (/\/(avatar|image)$/.test(path) || path.startsWith("/api/admin/uploads/"))
    ) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })
    }

    if (path.startsWith("/api/auth/")) {
      if (path === "/api/auth/get-session") {
        return json(
          route,
          me.authenticated && me.user
            ? {
                session: {
                  id: "e2e-session",
                  userId: me.user.id,
                  expiresAt: "2099-01-01T00:00:00.000Z",
                },
                user: { ...me.user, emailVerified: true },
              }
            : null
        )
      }
      return json(route, { error: "auth not available in e2e" }, 404)
    }

    if (method !== "GET") {
      const body = bodyOf(req)
      mock.mutations.push({ method, path, body })
      const res = mutationResponse(method, path, body)
      if (path === "/api/me/link-player" && method === "POST") {
        const linkedId = (res as { linkedPlayerId?: string }).linkedPlayerId
        if (linkedId) {
          me.linkedPlayerId = linkedId
        }
      }
      return json(route, res)
    }

    if (path === "/api/me") return json(route, me)
    if (path === "/api/public/settings") return json(route, data.settings)
    if (path === "/api/public/home") {
      const month = url.searchParams.get("month") || LATEST_MONTH
      return json(route, data.home[month] ?? { ...latestHome, month, bills: [] })
    }
    if (path === "/api/public/ranks") {
      const scope = url.searchParams.get("scope") === "all-time" ? "all-time" : "monthly"
      return json(route, data.ranks[scope])
    }
    let m = path.match(/^\/api\/public\/players\/([^/]+)$/)
    if (m) {
      const detail = data.players[decodeURIComponent(m[1])]
      return detail ? json(route, detail) : json(route, { error: "Not found" }, 404)
    }
    m = path.match(/^\/api\/public\/bills\/([^/]+)$/)
    if (m) {
      const detail = data.bills[decodeURIComponent(m[1])]
      return detail ? json(route, detail) : json(route, { error: "Not found" }, 404)
    }

    if (as === "admin") {
      if (path === "/api/admin/bills") {
        return json(route, {
          active: data.adminBills.active,
          drafts: [DRAFT_BILL],
          archived: [ARCHIVED_BILL],
        })
      }
      if (path === "/api/admin/players") return json(route, data.adminPlayers)
      const billMatch = path.match(/^\/api\/admin\/bills\/([^/]+)$/)
      if (billMatch) {
        const detail = data.adminBillDetails[decodeURIComponent(billMatch[1])]
        return detail ? json(route, detail) : json(route, { error: "Not found" }, 404)
      }
      if (path === "/api/admin/settings") return json(route, data.adminSettings)
    } else if (path.startsWith("/api/admin/")) {
      return json(route, { error: "Unauthorized" }, 401)
    }

    return json(route, { error: `not mocked in e2e: ${method} ${path}` }, 404)
  })

  return mock
}
