import {
  DETAIL_BILL,
  DOSSIER_PLAYER,
  LATEST_MONTH,
  PREVIOUS_MONTH,
  data,
  latestHome,
  mockApi,
} from "./support/api"
import { expect, test, waitForLoaded } from "./support/test"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const monthTitle = (key: string) => {
  const [y, m] = key.split("-")
  return `${MONTHS[Number(m) - 1]} ${y}`
}
const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`

test("primary navigation reaches every public section and back", { tag: "@critical" }, async ({ page }) => {
  await page.goto("/")
  await waitForLoaded(page)
  const nav = page.getByRole("navigation", { name: "Primary" })

  await nav.getByRole("link", { name: "Bills" }).click()
  await expect(page).toHaveURL(/\/bills$/)
  await expect(page.getByRole("heading", { level: 1, name: `${monthTitle(LATEST_MONTH)} bills` })).toBeVisible()

  await nav.getByRole("link", { name: "Ranks" }).click()
  await expect(page).toHaveURL(/\/ranks$/)
  await expect(page.getByRole("heading", { level: 1, name: "All ranks" })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/bills$/)
  await expect(page.getByRole("heading", { level: 1, name: /bills$/ })).toBeVisible()

  await nav.getByRole("link", { name: "Home" }).click()
  await expect(page.getByRole("heading", { level: 1, name: /Bills to pay/ })).toBeVisible()
})

test("theme choice applies immediately and survives a reload", async ({ page }) => {
  await page.goto("/")
  await waitForLoaded(page)
  await page.getByRole("button", { name: "Appearance theme" }).click()
  await page.getByRole("button", { name: "Dark" }).click()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
  await page.getByRole("button", { name: "Appearance theme" }).click()
  await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Escape")

  await page.reload()
  await waitForLoaded(page)
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
})

test.describe("home", () => {
  test("picking a callsign updates the pay card and is remembered", async ({ page }) => {
    await page.goto("/")
    await waitForLoaded(page)
    const roster = page.getByRole("region", { name: "Who are you?" })
    const chip = roster.getByRole("button", { name: new RegExp(`\\b${DOSSIER_PLAYER.name}\\b`) })
    await chip.click()
    await expect(chip).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByText(`Pay all (${DOSSIER_PLAYER.name})`)).toBeVisible()
    await expect(page.getByRole("link", { name: `Open ${DOSSIER_PLAYER.name}’s dossier` })).toBeVisible()

    await page.reload()
    await waitForLoaded(page)
    await expect(page.getByText(`Pay all (${DOSSIER_PLAYER.name})`)).toBeVisible()
  })

  test("copy amount gives feedback and pay & report asks guests to sign in", { tag: "@critical" }, async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.addInitScript((id) => localStorage.setItem("tq-selected-player", id), DOSSIER_PLAYER.id)
    await page.goto("/")
    await waitForLoaded(page)
    const owed = DOSSIER_PLAYER.unpaidBills.reduce((s, b) => s + b.amount, 0)

    await page.getByRole("button", { name: `Copy ${owed}` }).click()
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(String(owed))

    await page.getByRole("button", { name: "Pay & confirm" }).click()
    const dialog = page.getByRole("dialog", { name: "Pay & confirm" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(`${DOSSIER_PLAYER.name} owes ${rupiah(owed)}`)).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Sign in to notify" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
  })
})

test.describe("bills archive", () => {
  test("month stepper loads the previous month and back", async ({ page }) => {
    await page.goto("/bills")
    await waitForLoaded(page)
    await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled()

    const prevReq = page.waitForRequest((r) => r.url().includes(`/api/public/home?month=${PREVIOUS_MONTH}`))
    await page.getByRole("button", { name: "Previous month" }).click()
    await prevReq
    await expect(page.getByRole("heading", { level: 1, name: `${monthTitle(PREVIOUS_MONTH)} bills` })).toBeVisible()
    const prevBills = data.home[PREVIOUS_MONTH].bills
    await expect(page.getByText(prevBills[0].merchant).first()).toBeVisible()

    await page.getByRole("button", { name: "Next month" }).click()
    await expect(page.getByRole("heading", { level: 1, name: `${monthTitle(LATEST_MONTH)} bills` })).toBeVisible()
  })

  test("week filter narrows the list and can be cleared", async ({ page }) => {
    await page.goto("/bills")
    await waitForLoaded(page)
    const weekButtons = page.locator("button[aria-pressed]")
    const count = await weekButtons.count()
    expect(count).toBeGreaterThan(0)
    // Pick a week that has orders.
    let picked = -1
    for (let i = 0; i < count; i++) {
      const text = (await weekButtons.nth(i).innerText()).toLowerCase()
      if (!text.startsWith("all weeks") && !/\b0 orders\b/.test(text)) { picked = i; break }
    }
    expect(picked).toBeGreaterThanOrEqual(0)
    const week = weekButtons.nth(picked)
    await week.click()
    await expect(week).toHaveAttribute("aria-pressed", "true")
    await week.click()
    await expect(week).toHaveAttribute("aria-pressed", "false")
  })
})

test.describe("ranks", () => {
  test("switching to all time refetches and search filters players", async ({ page }) => {
    await page.goto("/ranks")
    await waitForLoaded(page)
    const allTime = page.waitForRequest((r) => r.url().includes("/api/public/ranks?scope=all-time"))
    await page.getByRole("tab", { name: "All time" }).click()
    await allTime
    await expect(page.getByRole("tab", { name: "All time" })).toHaveAttribute("aria-selected", "true")

    const target = data.ranks["all-time"].players[0].name
    const other = data.ranks["all-time"].players.find((p) => p.name !== target)!.name
    await page.getByRole("searchbox", { name: "Search players" }).or(page.getByRole("textbox", { name: "Search players" })).fill(target)
    await expect(page.getByText(target, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(other, { exact: true })).toHaveCount(0)

    await page.getByRole("button", { name: "Clear search" }).click()
    await expect(page.getByText(other, { exact: true }).first()).toBeVisible()
  })
})

test.describe("bill detail", () => {
  test("lists every split and opens/closes the receipt preview", { tag: "@critical" }, async ({ page }) => {
    await page.goto(`/b/${DETAIL_BILL.publicId}`)
    await waitForLoaded(page)
    await expect(page.getByRole("heading", { level: 1, name: DETAIL_BILL.merchant })).toBeVisible()
    for (const split of DETAIL_BILL.splits) {
      await expect(page.getByText(split.name, { exact: true }).first()).toBeVisible()
    }

    await page.getByRole("button", { name: "Receipt photo" }).click()
    const modal = page.getByRole("dialog", { name: "Receipt photo" })
    await expect(modal).toBeVisible()
    await page.getByRole("button", { name: "Close receipt modal" }).click()
    await expect(modal).toBeHidden()
  })

  test("receipt preview closes with Escape", async ({ page }) => {
    await page.goto(`/b/${DETAIL_BILL.publicId}`)
    await waitForLoaded(page)
    await page.getByRole("button", { name: "Receipt photo" }).click()
    const modal = page.getByRole("dialog", { name: "Receipt photo" })
    await expect(modal).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(modal).toBeHidden()
  })
})

test.describe("player dossier", () => {
  test("opens from the home roster link and shows the player's unpaid bills", async ({ page }) => {
    await page.addInitScript((id) => localStorage.setItem("tq-selected-player", id), DOSSIER_PLAYER.id)
    await page.goto("/")
    await waitForLoaded(page)
    await page.getByRole("link", { name: `Open ${DOSSIER_PLAYER.name}’s dossier` }).click()
    await expect(page).toHaveURL(new RegExp(`/players/${DOSSIER_PLAYER.id}$`))
    await waitForLoaded(page)
    await expect(page.getByRole("heading", { level: 1, name: DOSSIER_PLAYER.name })).toBeVisible()
    await expect(page.getByText(DOSSIER_PLAYER.unpaidBills[0].merchant).first()).toBeVisible()
  })

  test("home lists open bills from the feed", async ({ page }) => {
    await page.goto("/")
    await waitForLoaded(page)
    await expect(page.getByRole("heading", { level: 1, name: `Bills to pay (${latestHome.unpaidBills.length} open)` })).toBeVisible()
  })
})

test.describe("first-login self-identification", () => {
  test("prompts an unlinked signed-in user to identify themselves and links their chosen player", { tag: "@critical" }, async ({ page }) => {
    const api = await mockApi(page, { as: "unlinked" })
    const unlinkedPlayer = latestHome.players.find(
      (p) => p.archivedAt === null && p.userId === null
    )!

    await page.goto("/")
    await waitForLoaded(page)

    const dialog = page.getByRole("dialog", { name: "Who are you?" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("new.friend@example.com")).toBeVisible()

    // Skipping dismisses for this session, and account menu can reopen it
    await dialog.getByRole("button", { name: "Not on the list / Skip" }).click()
    await expect(dialog).toBeHidden()

    await page.getByRole("button", { name: /New Friend/i }).click()
    await page.getByRole("button", { name: "Link my player" }).click()
    await expect(dialog).toBeVisible()

    // Selecting a player and confirming sends POST /api/me/link-player
    await dialog
      .getByRole("radio", { name: new RegExp(`\\b${unlinkedPlayer.name}\\b`) })
      .click()
    await dialog
      .getByRole("button", { name: `Confirm: I'm ${unlinkedPlayer.name}` })
      .click()

    await expect(dialog).toBeHidden()
    expect(api.mutations).toContainEqual({
      method: "POST",
      path: "/api/me/link-player",
      body: { playerId: unlinkedPlayer.id },
    })
    await expect(page.getByText(`Pay all (${unlinkedPlayer.name})`)).toBeVisible()
  })
})
