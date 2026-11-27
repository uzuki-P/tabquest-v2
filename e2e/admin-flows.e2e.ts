import { DOSSIER_PLAYER, EDITABLE_BILL, data } from "./support/api"
import type { ApiMock } from "./support/api"
import { expect, test, waitForLoaded } from "./support/test"

test.use({ api: { as: "admin" } })

async function waitForMutation(mock: ApiMock, method: string, path: string | RegExp) {
  await expect
    .poll(() =>
      mock.mutations.find(
        (m) => m.method === method && (typeof path === "string" ? m.path === path : path.test(m.path))
      ),
      { message: `${method} ${path}` }
    )
    .toBeTruthy()
  return mock.mutations.find(
    (m) => m.method === method && (typeof path === "string" ? m.path === path : path.test(m.path))
  )!
}

test.describe("admin bills list", () => {
  test("status tabs show active, draft and archived bills", async ({ page }) => {
    await page.goto("/admin")
    await waitForLoaded(page)
    const tabs = page.getByRole("tablist", { name: "Bill status filter" })
    await expect(tabs.getByRole("tab", { name: `Active (${data.adminBills.active.length})` })).toBeVisible()
    await expect(page.getByText(data.adminBills.active[0].merchant).first()).toBeVisible()

    await tabs.getByRole("tab", { name: "Drafts (1)" }).click()
    await expect(page.getByText("E2E Draft Kitchen")).toBeVisible()

    await tabs.getByRole("tab", { name: "Archived (1)" }).click()
    await expect(page.getByText("E2E Archived Cafe")).toBeVisible()
  })

  test("archive and restore send the matching action", async ({ page, mock }) => {
    await page.goto("/admin")
    await waitForLoaded(page)
    const bill = data.adminBills.active[0]
    await page.getByRole("button", { name: "Archive" }).first().click()
    const archive = await waitForMutation(mock, "PATCH", `/api/admin/bills/${bill.id}`)
    expect(archive.body).toEqual({ action: "archive" })

    await page.getByRole("tab", { name: "Archived (1)" }).click()
    await page.getByRole("button", { name: "Restore" }).click()
    const restore = await waitForMutation(mock, "PATCH", "/api/admin/bills/e2e-archived-bill")
    expect(restore.body).toEqual({ action: "unarchive" })
  })

  test("publishing a draft sends a publish action", { tag: "@critical" }, async ({ page, mock }) => {
    await page.goto("/admin")
    await waitForLoaded(page)
    await page.getByRole("tab", { name: "Drafts (1)" }).click()
    await page.getByRole("button", { name: "Publish" }).click()
    const req = await waitForMutation(mock, "PATCH", "/api/admin/bills/e2e-draft-bill")
    expect(req.body).toEqual({ action: "publish" })
  })

  test("deleting a draft asks for confirmation first", async ({ page, mock }) => {
    await page.goto("/admin")
    await waitForLoaded(page)
    await page.getByRole("tab", { name: "Drafts (1)" }).click()
    await page.getByRole("button", { name: "Delete draft E2E Draft Kitchen" }).click()

    const dialog = page.getByRole("dialog", { name: "Delete this draft?" })
    await expect(dialog).toBeVisible()
    await dialog.getByRole("button", { name: "Keep draft" }).click()
    await expect(dialog).toBeHidden()
    expect(mock.mutations.filter((m) => m.method === "DELETE")).toEqual([])

    await page.getByRole("button", { name: "Delete draft E2E Draft Kitchen" }).click()
    await dialog.getByRole("button", { name: "Delete draft" }).click()
    await waitForMutation(mock, "DELETE", "/api/admin/bills/e2e-draft-bill")
    await expect(dialog).toBeHidden()
  })

  test("collect all drawer opens and closes", { tag: "@critical" }, async ({ page }) => {
    await page.goto("/admin")
    await waitForLoaded(page)
    await page.getByRole("button", { name: /Collect all/ }).click()
    const drawer = page.getByRole("dialog", { name: "Admin Collect All" })
    await expect(drawer).toBeVisible()
    await drawer.getByRole("button", { name: "Close Collect All drawer" }).click()
    await expect(drawer).toBeHidden()
  })
})

test.describe("edit bill", () => {
  const detail = data.adminBillDetails[EDITABLE_BILL.id]

  test("opens from the admin list prefilled with the bill", async ({ page }) => {
    await page.goto("/admin")
    await waitForLoaded(page)
    const row = page.locator("li, article, div").filter({ hasText: EDITABLE_BILL.merchant }).filter({
      has: page.getByRole("link", { name: "Edit" }),
    }).last()
    await row.getByRole("link", { name: "Edit" }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/bills/${EDITABLE_BILL.id}/edit$`))
    await waitForLoaded(page)
    await expect(page.getByRole("heading", { level: 1, name: "Edit Bill" })).toBeVisible()
    await expect(page.getByPlaceholder("e.g. Kopi Tuku Kemang")).toHaveValue(detail.bill.merchant)
  })

  test("opens from the public bill page for admins", async ({ page }) => {
    await page.goto(`/b/${detail.bill.publicId}`)
    await waitForLoaded(page)
    await page.getByRole("link", { name: "Edit bill" }).click()
    await expect(page).toHaveURL(new RegExp(`/admin/bills/${detail.bill.id}/edit$`))
    await waitForLoaded(page)
    await expect(page.getByPlaceholder("e.g. Kopi Tuku Kemang")).toHaveValue(detail.bill.merchant)
  })

  test("saving changes sends the full edited bill and returns to the bill page", { tag: "@critical" }, async ({ page, mock }) => {
    await page.goto(`/admin/bills/${detail.bill.id}/edit`)
    await waitForLoaded(page)
    await page.getByPlaceholder("e.g. Kopi Tuku Kemang").fill("Renamed Merchant")

    await page.getByRole("button", { name: "Save changes" }).first().click()
    const confirm = page.getByRole("dialog")
    await expect(confirm).toBeVisible()
    // Renaming changes no shares, so no paid-player warning.
    await expect(confirm.getByTestId("paid-player-changes")).toHaveCount(0)
    await confirm.getByRole("button", { name: "Save changes" }).click()

    const req = await waitForMutation(mock, "PATCH", `/api/admin/bills/${detail.bill.id}`)
    const body = req.body as {
      merchant: string
      publish: boolean
      items: unknown[]
      adjustments: unknown[]
      billPlayers: { playerId: string | null }[]
      allocations: { quantity: number }[]
    }
    expect(body.merchant).toBe("Renamed Merchant")
    expect(body.publish).toBe(true)
    expect(body.items).toHaveLength(detail.items.length)
    expect(body.adjustments).toHaveLength(detail.adjustments.length)
    expect(body.billPlayers.map((p) => p.playerId).sort()).toEqual(
      detail.billPlayers.map((p) => p.playerId).sort()
    )
    // Every allocated unit survives a round trip through the editor.
    const sum = (xs: { quantity: number }[]) => xs.reduce((s, x) => s + x.quantity, 0)
    expect(sum(body.allocations)).toBe(sum(detail.allocations as { quantity: number }[]))

    await expect(page).toHaveURL(new RegExp(`/b/${detail.bill.publicId}$`))
  })

  test.describe(() => {
    test.use({ allowedErrors: [/404 \(Not Found\)/] })
  test("confirmation warns when a paid player's share changes", async ({ page, mock }) => {
    const paid = (detail.paymentStatuses ?? []).filter((p) => p.status === "paid")
    test.skip(paid.length === 0, "fixture bill has no paid players")
    await page.goto(`/admin/bills/${detail.bill.id}/edit`)
    await waitForLoaded(page)
    await page.getByRole("button", { name: "Next: Items & fees" }).click()
    const prices = page.getByLabel("Unit price", { exact: true })
    const count = await prices.count()
    expect(count).toBe(detail.items.length)
    for (let i = 0; i < count; i++) {
      await prices.nth(i).fill(String(detail.items[i].unitPrice + 1000))
    }

    await page.getByRole("button", { name: "Save changes" }).first().click()
    const confirm = page.getByRole("dialog")
    const warning = confirm.getByTestId("paid-player-changes")
    await expect(warning).toBeVisible()
    const paidNames = paid
      .map((ps) => detail.billPlayers.find((bp) => bp.id === ps.billPlayerId)?.alias)
      .filter((n): n is string => Boolean(n))
    await expect(warning.getByText(paidNames[0], { exact: true })).toBeVisible()
    await expect(warning).toContainText("tip -")

    // Backing out saves nothing.
    await confirm.getByRole("button", { name: "Back to edit" }).click()
    await expect(confirm).toBeHidden()
    expect(mock.mutations.filter((m) => m.method === "PATCH")).toEqual([])
  })

  test("published bills have no direct draft save on the last step", async ({ page }) => {
    await page.goto(`/admin/bills/${detail.bill.id}/edit`)
    await waitForLoaded(page)
    for (const next of ["Next: Items & fees", "Next: People", "Next: Split & review"]) {
      await page.getByRole("button", { name: next }).click()
    }
    await expect(page.getByRole("button", { name: /^Save (as )?draft$/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(2)
  })

  test("unknown bill shows a not-found state", async ({ page }) => {
    await page.goto("/admin/bills/does-not-exist/edit")
    await waitForLoaded(page)
    await expect(page.getByRole("heading", { name: "Bill not found." })).toBeVisible()
    await expect(page.getByRole("link", { name: "Back to Admin Bills" })).toBeVisible()
  })
  })
})

test.describe("new bill", () => {
  test("saving an incomplete draft posts it unpublished and returns to admin", { tag: "@critical" }, async ({ page, mock }) => {
    await page.goto("/admin/bills/new")
    await waitForLoaded(page)
    await page.getByPlaceholder("e.g. Kopi Tuku Kemang").fill("E2E Noodle Bar")
    await page.getByRole("button", { name: "Save as draft" }).click()
    const req = await waitForMutation(mock, "POST", "/api/admin/bills")
    expect((req.body as { merchant: string; publish: boolean }).merchant).toBe("E2E Noodle Bar")
    expect((req.body as { publish: boolean }).publish).toBe(false)
    await expect(page).toHaveURL(/\/admin$/)
  })
})

test.describe("settings", () => {
  test("applying branding saves it and updates the header", async ({ page, mock }) => {
    await page.goto("/admin/settings")
    await waitForLoaded(page)
    await page.getByLabel("App title").fill("Lunch Guild")
    await page.getByRole("button", { name: "Apply branding" }).click()
    const req = await waitForMutation(mock, "PUT", "/api/admin/settings")
    expect((req.body as { appName: string }).appName).toBe("Lunch Guild")
    await expect(page.getByRole("banner").getByText("Lunch Guild")).toBeVisible()
  })
})

test.describe("payment methods", () => {
  test("new methods default the account holder to the admin's name", async ({ page }) => {
    await page.goto("/admin/settings")
    await waitForLoaded(page)
    await expect(page.getByLabel("Account holder name")).toHaveValue(data.adminMe.user!.name)
  })
})

test.describe("players", () => {
  test("adding a player posts the name and email", async ({ page, mock }) => {
    await page.goto("/admin/players")
    await waitForLoaded(page)
    await page.getByPlaceholder("e.g. Arya").fill("Newbie")
    await page.getByPlaceholder("arya@gmail.com").fill("newbie@example.com")
    await page.getByRole("button", { name: "Add player" }).click()
    const req = await waitForMutation(mock, "POST", "/api/admin/players")
    expect(req.body).toMatchObject({ name: "Newbie" })
  })
})

test.describe("linked player", () => {
  test("the admin's linked player can report a transfer", { tag: "@critical" }, async ({ page, mock }) => {
    const linked = latestLinkedPlayer()
    test.skip(!linked, "fixture admin is not linked to a player with unpaid bills")
    await page.goto("/")
    await waitForLoaded(page)
    await page.getByRole("button", { name: "Pay & report" }).click()
    const dialog = page.getByRole("dialog", { name: "Pay & report" })
    await dialog.getByRole("button", { name: /^Notify / }).click()
    const req = await waitForMutation(mock, "POST", "/api/me/transfer-claims")
    const owed = linked!.unpaidBills.reduce((s, b) => s + b.amount, 0)
    expect(req.body).toEqual({ claimedAmount: owed })
    await expect(dialog).toBeHidden()
  })
})

function latestLinkedPlayer() {
  const id = data.adminMe.linkedPlayerId
  const home = data.home[Object.keys(data.home).sort().at(-1)!]
  const p = home.players.find((x) => x.id === id)
  return p && p.unpaidBills.length > 0 ? p : DOSSIER_PLAYER.id === id ? DOSSIER_PLAYER : null
}
