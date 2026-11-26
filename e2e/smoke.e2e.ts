import AxeBuilder from "@axe-core/playwright"

import { DETAIL_BILL, DOSSIER_PLAYER, EDITABLE_BILL } from "./support/api"
import {
  expect,
  expectNoHorizontalOverflow,
  test,
  waitForLoaded,
} from "./support/test"

interface PageCase {
  name: string
  path: string
  heading: string | RegExp
  /** Expected 404s for not-found pages. */
  notFound?: boolean
}

const PUBLIC_PAGES: PageCase[] = [
  { name: "home", path: "/", heading: /Bills to pay/ },
  { name: "bills", path: "/bills", heading: /^\w+ \d{4} bills$/ },
  { name: "ranks", path: "/ranks", heading: "All ranks" },
  { name: "bill detail", path: `/b/${DETAIL_BILL.publicId}`, heading: DETAIL_BILL.merchant },
  { name: "player dossier", path: `/players/${DOSSIER_PLAYER.id}`, heading: DOSSIER_PLAYER.name },
  { name: "unknown player", path: "/players/does-not-exist", heading: "Player not found", notFound: true },
  { name: "unknown bill", path: "/b/does-not-exist", heading: /./, notFound: true },
  { name: "unknown page", path: "/no-such-page", heading: /./, notFound: true },
  { name: "admin as guest", path: "/admin", heading: "Admin access required" },
]

const ADMIN_PAGES: PageCase[] = [
  { name: "admin bills", path: "/admin", heading: "Admin Bills" },
  { name: "admin players", path: "/admin/players", heading: "Players & Account Linking" },
  { name: "admin settings", path: "/admin/settings", heading: "Workspace Settings" },
  { name: "admin new bill", path: "/admin/bills/new", heading: "New Bill" },
  { name: "admin edit bill", path: `/admin/bills/${EDITABLE_BILL.id}/edit`, heading: "Edit Bill" },
]

const NOT_FOUND_ERRORS = [/404 \(Not Found\)/]

function definePageTests(pages: PageCase[]) {
  for (const theme of ["light", "dark"] as const) {
    for (const pc of pages) {
      test.describe(() => {
        if (pc.notFound) test.use({ allowedErrors: NOT_FOUND_ERRORS })

        test(`${pc.name} renders accessibly (${theme})`, async ({ page }) => {
          await page.addInitScript((t) => {
            localStorage.setItem("tq-theme-pref", t)
          }, theme)
          await page.goto(pc.path)
          await waitForLoaded(page)
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme)
          if (!pc.notFound || pc.name === "unknown player") {
            await expect(
              page.getByRole("heading", { level: 1, name: pc.heading }).first()
            ).toBeVisible()
          }
          await expectNoHorizontalOverflow(page)

          const axe = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa"])
            // The active tab's text sits on a sibling indicator element that axe
            // cannot see, so it reports a false contrast failure.
            .exclude('[data-slot="tabs-trigger"][data-active]')
            .analyze()
          const violations = axe.violations.map(
            (v) =>
              `${v.id}: ${v.nodes.length}x, e.g. ${v.nodes[0].target.join(" ")} :: ${
                v.nodes[0].failureSummary?.split("\n")[1]?.trim() ?? ""
              }`
          )
          expect(violations, "axe WCAG 2 A/AA violations").toEqual([])
        })
      })
    }
  }
}

test.describe("public pages", () => {
  definePageTests(PUBLIC_PAGES)
})

test.describe("admin pages", () => {
  test.use({ api: { as: "admin" } })
  definePageTests(ADMIN_PAGES)
})
