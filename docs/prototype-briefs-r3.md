# Tabquest v2 Prototype Briefs, Round 3

Build **2 evolved, feature-complete prototypes** in one pass. Both are full desktop AND mobile, both reach v1 feature parity, both honor the Round 2 feedback.

Files (props = `VariantProps` from `variant-types.ts`):
- `src/prototypes/variant-i-telemetry-v2.tsx` (A, evolves `variant-g-telemetry.tsx`)
- `src/prototypes/variant-j-moss-desk.tsx` (B, evolves `variant-h-pocket.tsx`)
- Register both in `prototype-switcher.tsx`. Data only from `mock-data.ts`. Reuse the Round 2 logic (Boss HP, crack preview, settle, FLIP rank, admin collect) by copying from G and H, then restyle.

## 1. User feedback to satisfy (non-negotiable)

1. **Pay-All defaults to Exact (`owed`).** On open, on player switch, and after every settle the selected chip is `Exact`. Never pre-select a round-up. Round-up chips come from `getRoundUpOptions(owed)` and show `+RpX tip`. Tapping the active round-up again returns to Exact.
2. **Player selection must be prominent.** A horizontal chip/pill bar "Who are you?" sits directly above Pay-All / Bills with unpaid counts, e.g. `Bima (3)`, `Farhan (2)`. No `<select>`, no tiny dropdown. Active chip is filled with the accent. Mobile: horizontally scrollable, snap, 44px min tap height.
3. **Pocket Moss readability + desktop.** B must not be a 520px shell. Replace `Pixelify Sans`.
4. **v1 parity.** Features listed in section 3 appear in BOTH.

## 2. Page order (strict vertical priority, both prototypes)

```
Top bar (brand, nav pills, Appearance toggle, role switcher)
Month Navigator + Monthly Summary Strip
Player Roster bar ("Who are you?")
1. Bills to Pay  (Pay-All, Exact default, round-up tip chips, Boss HP bars, 10 animation fixes)
   [Admin only: Collect-All entry, visible only if role === "admin"]
2. Tip Rank (id="tip-jar")  +  Spending Rank (id="players")
3. Month in Weeks strip  +  Old/Recent Bills (Mission Log / Save Slots)
```
Desktop (>=1024px): content max 1120px (A may use 1200px). Section 1 may be a 2-column layout (roster+pay-all left, boss bars right). Sections 2 splits into two columns. Mobile (<640px): single column, no horizontal page scroll, sticky bottom Pay-All bar showing `Pay Rp<amount>` when section 1 is off screen.

## 3. Shared v1 feature spec (both prototypes)

**Month Navigator + Summary Strip**
- `< Prev | Today | Next >` buttons + title `November 2026`. State `monthOffset` (0 = Nov 2026).
- Offset 0 shows live data. Any other offset renders an honest archived/empty state ("No bills archived for October 2026") in the sections, with a `Back to Today` button. `Today` resets to 0. Next from 0 is disabled with tooltip "No future bills".
- Strip: `N bills / RpX billed / RpY tipped`. N = bills in the month (respect Week filter only in the Log, not the strip). Billed = sum `finalTotal`. Tipped = sum `monthlyTips`. Use `formatRupiah`.

**Top nav and Appearance**
- Pills `Bills`, `Tip jar`, `Players`: smooth scroll-jump to `#bills`, `#tip-jar`, `#players` (with `scroll-margin-top` for sticky bar). Highlight the active section via IntersectionObserver.
- **Appearance toggle**: segmented `Light | Dark` (icon + label, aria-pressed). Persist to `localStorage` key `tq-r3-appearance`. Implemented via a `data-theme` attribute on the prototype root and CSS variables (no duplicated components). Each theme must pass 4.5:1 text contrast.

**Spending Rank (full v1)**
Per row/card: rank, avatar, name, `tierForSpend(spend, top)` tier tag (`Final Boss`, `Miniboss`, `Regular`, `Rookie`, each with its own color + icon), spend, **earned badge** from `player.badge` (`Top spender`, `Big heart`, `Discount hunter`, `Loyal`, `Biggest strike`; null shows nothing), discount line `N bills, saved Rp239.675 (44.2%)` from `ordersCount`, `savedDiscount`, `savedPct`, and overtake line from `gapToNextSpend`: `Steal #1 for Rp55.500` (targetRank/amount), or `Champion of the month` for #1. Gap line is a visible text, not a tooltip. Sort via `getSpendingLeaderboard`.

**Tip Rank (full v1)**
Per tipper: rank, avatar, tips, `% of the jar` = `round(tips / sumAllTips * 100)` (e.g. `31% of the jar`) with a proportional bar, and best-tip note (`bestTipNote`). Header: `Dropped in by N players this month` (N = players with tips > 0) and jar total. Keep `projectTipRank` preview and the reorder animation from Round 2.

**Month in Weeks filter**
- Tiles from `NOVEMBER_WEEKS`: `Week 1` / `Nov 1-7` / `N orders` (count bills where `getBillDayOfMonth(orderDate)` falls in start..end). Weeks with 0 orders are still shown, dimmed, and selectable (empty state "No bills this week").
- Plus an `All weeks` toggle (default active). Selecting a tile filters the Old/Recent Bills list below; selecting it again or `All weeks` clears. Show `Showing Week 2 · 3 bills` caption with a clear button. Desktop: 6 equal tiles in a row; mobile: horizontal scroll or 2-col grid.

**Bills to Pay**
- Pay-All card: total owed for the active player, `Exact` chip pre-selected, round-up chips with tip deltas, projected tip rank line, `Pay-All` CTA, claim submission to `TRANSFER_DESTINATION`, pending-claim state.
- Per-bill **Proportional Boss HP Bars**: width = `amount / playerUnpaidTotal` (min 8% visible), numeric Rp label always shown. Hit preview on chip change (crack/blink), settle animation on success.
- Keep ALL 10 Round 2 animation fixes: no layout jump on chip change, reduced-motion fallback (`prefers-reduced-motion` disables shake/shatter/FLIP, uses fades), single animation owner per element, no transform on text containers, cleanup on unmount and player switch, no replay when the same chip is re-tapped, settle disabled until animation ends, FLIP uses measured rects not index math, particles pointer-events none, no animation on Appearance switch.

**Admin Collect-All**: render only when `role === "admin"`. Lists every player with unpaid totals and a `Collect all` action.

**Accessibility baseline**: body text >= 15px mobile and >= 16px desktop, numerals >= 18px, focus rings visible, all chips are `button` with `aria-pressed`, tap targets >= 44px.

## 4. Prototype A: "Raid Telemetry v2" (`variant-i-telemetry-v2.tsx`)

**Look:** keep Raid Telemetry's mecha hangar identity. Light mode (default): alabaster panels, gunmetal text/linework, signal-orange primary, radar-teal secondary/positive. **Dark Hangar** mode: deep gunmetal `#12161b`-range background, lifted panels, same orange and teal slightly brightened, thin teal grid lines. Beveled armor plates (clip-path chamfered corners), rivets, hazard-stripe dividers, scanline sweep on section reveal. Fonts unchanged from G (keep its mono/telemetry display), but raise body size to the baseline above.

**Layout**
- **Squad Roster bar** directly above the cockpit: row of armor-plate chips, each `callsign (unpaid count)` + small unpaid Rp total; active plate glows orange with a notch marker `PILOT`. Unpaid 0 shows a teal check. This replaces the hidden selector entirely.
- Month Navigator styled as a `SORTIE CALENDAR` ruler bar with the summary strip as three LED readouts (`BILLS`, `BILLED`, `TIPPED`).
- Cockpit: Pay-All reticle and 0-100% scale ruler. Exact is the pre-selected notch at 100% of owed. Round-up chips are ruler ticks beyond 100% labeled `+RpX`. Reticle snap to the active tick and crack preview on the Boss plate stay.
- Boss HP bars: armor plates with segmented HP cells, 3-shard shatter on settle.
- Tip Jar `% of the jar` as telemetry gauges; Spending Rank as dossier plates with tier insignia, badge stamp, savings readout, `Steal #N for RpX` as an orange "TARGET LOCK" line.
- Week strip as 5 hangar-bay tiles above the **Mission Log**.
- **Command drawer** on the right, 420px wide on desktop (full-width bottom sheet on mobile): bill detail, split lines, transfer destination, claim form, admin Collect-All controls.

## 5. Prototype B: "Moss Field Console" (`variant-j-moss-desk.tsx`)

**Look:** keep Pocket Moss's tactile muted moss/olive, slate-ink text, Hit-Red damage color. Light mode: warm paper-moss background (`#e4e8d6`-range), olive panels, slate-ink `#1f2a2e`. **Night Ops Dark Moss** mode: near-black green-slate background, desaturated moss panels, off-white text, Hit-Red still readable. Pixel flavor lives in shapes only (notched stepped corners via `clip-path` polygons, 3px solid borders, hard shadows `4px 4px 0`), never in the type.
- **Fonts (Google Fonts, load via `<link>` in the component or index.html):** `Chakra Petch` 600/700 for headings and numbers, `Plus Jakarta Sans` 400-700 for body, `JetBrains Mono` 500-700 for every Rupiah value. Drop `Pixelify Sans` everywhere. Minimum body 16px, headings 20px+, Rupiah 18px+.
- **Responsive tactical strategy desk:** wide 1120px container, 12-col grid on desktop (roster full width; Pay-All 5 cols + Boss blocks 7 cols; Tip and Spending side by side 6/6; weeks + save slots below). On mobile it collapses to a single column with the same order. Not a phone frame.

**Layout**
- **Pilot Roster bar** above Bills: big square-notched chips with avatar, name, `(unpaid count)`, active chip inverted.
- Month Navigator as a "Season Select" bar with a pixel arrow cluster, summary strip as three stat blocks.
- Boss HP: notched stepped pixel HP blocks (segment count scales with proportion), stepped blink/shake preview using `steps()` timing, 4x2 crumbling pixel blocks on settle.
- Tip Rank with `steps()` FLIP reorder; `% of the jar` as stepped pixel meters; Spending Rank rows with tier tags, badge medals, savings line, and `Steal #N for RpX` as a clear text line.
- Week strip as 5 "Level Select" tiles; Old/Recent Bills as **Save Slots** (slot number, merchant, date, status, remaining Rp).
- **Admin Collect drawer/overlay:** right drawer (420px) on desktop, full-screen overlay on mobile, only for `role === "admin"`.

## 6. Acceptance checklist (Neon, verify before handing back)

- [ ] Pay-All opens on **Exact**; stays Exact after switching player and after settle.
- [ ] Roster bar visible without interaction, counts match `unpaidBills.length`, no `<select>`.
- [ ] Month Prev/Today/Next work; summary strip numbers correct; archived state honest.
- [ ] Light/Dark toggle works, persists, no flash, contrast ok in both prototypes.
- [ ] `Tip jar` and `Players` pills scroll to sections.
- [ ] Tiers, badges, savings line, `Steal #N for RpX` / `Champion of the month` present for every player.
- [ ] `% of the jar`, `Dropped in by N players`, best-tip note present.
- [ ] Week tiles show correct order counts, filter the list, `All weeks` clears.
- [ ] Admin Collect shows only for `admin`.
- [ ] 1280px and 390px screenshots: no horizontal overflow, text legible (B has zero Pixelify Sans).
- [ ] `bun run typecheck` and lint clean; no em-dashes in UI copy or comments.
