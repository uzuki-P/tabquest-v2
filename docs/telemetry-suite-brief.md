# Raid Telemetry Suite: design brief for Neon

Scope: evolve `src/prototypes/variant-i-telemetry-v2.tsx` into a multi-page, interactive prototype. Keep the Raid Telemetry look (Light Alabaster, Dark Hangar, Big Shoulders Display for big numbers and titles, chamfered roster chips, hard 2px ink borders, orange accent). Use `mock-data.ts` only. State is local, pages switch with a tiny in-prototype router (`view` state: `home | bill:<publicId> | player:<id> | ranks`), no real routes needed. Route labels in parentheses are for copy and hash only (`#/b/tuku-nov21`, `#/players/p-bima`, `#/ranks`).

## 1. Non-negotiables (apply to every component)

- Every `button`, `a`, chip, row link, chunk, tab and avatar that does something gets `cursor-pointer` AND a visible hover change (see section 2 hover table) AND `:focus-visible` outline (2px accent, 2px offset). Disabled: `cursor-not-allowed`, opacity 0.5, no hover change.
- Minimum sizes: body 16px (15px on mobile), secondary and metadata 14px (never below 13px, only for tooltip footnotes), Rupiah in rows 17px, Rupiah in cards 18px+, hero amounts 48-64px. Delete every `text-[10px]`, `text-[11px]`, `text-xs` from the v2 file. Tap targets 44px.
- Rupiah and counts use `font-arcade-mono` with `tnum`. Labels and prose use `font-ui-sans`. Display face only for page titles, hero amounts, rank numerals.
- Color is never the only status signal. Paid, Pending, Unpaid always carry an icon (Check, Clock, Warning) and a word.
- Respect existing 10 animation fixes and `prefers-reduced-motion`. No new idle motion. Only motion that answers an action (tooltip fade 120ms, chip press, modal open 160ms).

## 2. Palette and contrast audit (computed, WCAG 2.x)

Replace the v2 tokens with these. Ratios were computed, not eyeballed.

### Light Alabaster (`data-theme="light"`)

| Token | Hex | Used on | Ratio |
|---|---|---|---|
| `--rt-bg` | #ECE8DF | page | n/a |
| `--rt-surface` | #F7F4EC | cards | n/a |
| `--rt-surface-alt` | #FFFFFF | inputs, chips | n/a |
| `--rt-ink` | #2B2F36 | body on bg / surface | 10.99 / 12.23 |
| `--rt-muted` | #4A515C (was #585F6A) | secondary on bg / surface | 6.55 / 7.29 |
| `--rt-accent` (fill) | #C2410C (was #FF5B1F, only 3.0 with white) | white label on accent button | 5.18 |
| `--rt-accent-ink` | #A83205 | accent text on surface / bg | 6.12 / 5.50 |
| `--rt-teal-ink` | #0B6B65 | paid, tip text on surface / bg | 5.78 / 5.20 |
| `--rt-amber-ink` | #6B4C00 | pending text on surface / bg | 7.19 / 6.46 |
| `--rt-ui-border` | #6B7280 | input, chip, chunk outlines (UI 3:1) | 4.40 |
| `--rt-border` | #2B2F36 | card frames | 12.23 |
| topbar bg / ink / muted | #2B2F36 / #F7F4EC / #C5CCD6 | nav text | 12.23 / 8.31 |
| `--rt-tip-bg` / ink | #1F2329 / #F7F4EC | tooltip | 14.36 |

HP chunk fills (graphic objects need 3:1 vs surface): paid #0B7F78 (about 4.6), unpaid #C2410C (4.71), pending #8A6500 (about 5.0). Re-verify these three with a one-off script before commit; any value under 3.0 is a bug.

### Dark Hangar (`data-theme="dark"`)

| Token | Hex | Used on | Ratio |
|---|---|---|---|
| `--rt-bg` | #12161B | page | n/a |
| `--rt-surface` | #1A2028 | cards | n/a |
| `--rt-surface-alt` | #222A35 | inputs, chips | n/a |
| `--rt-ink` | #EEF2F6 | body on bg / surface | 16.14 / 14.57 |
| `--rt-muted` | #A3AFBE | secondary on surface / alt | 7.36 / 6.50 |
| `--rt-accent` (fill) | #FF6B35 with ink text #12161B | button label | 6.41 |
| `--rt-accent-ink` | #FF956B | accent text on surface | 7.62 |
| `--rt-teal-ink` | #5CE6DD | paid, tip text | 10.79 |
| `--rt-amber-ink` | #FCD765 | pending text | 11.74 |
| `--rt-ui-border` | #6B7A8E (was #465364, 2.0, fails) | input, chip outlines | 3.75 |
| topbar bg / ink | #0B0E12 / #EEF2F6 | nav | 17.19 |
| tooltip | #0B0E12 bg, #EEF2F6 ink, 1px #6B7A8E border | | 17.19 |

Dark chunk fills: paid #22C3B8 (7.47), unpaid #FF6B35 (5.78), pending #F5C32E (9.93).

Rule: accent as a FILL gets white text in light and near-black text in dark. Accent as TEXT always uses `--rt-accent-ink`. Never put `--rt-muted` on the accent or teal soft washes.

### Hover table (all themes use tokens, no hard-coded hex)

| Element | Hover |
|---|---|
| Primary button (accent fill) | darken 8% (light) or lighten 8% (dark), lift 1px hard shadow `2px 2px 0 var(--rt-accent-shadow)` |
| Secondary / chip (outlined) | border becomes `--rt-ink`, bg becomes `--rt-bg` |
| Selected chip (ink fill) | no change, but `aria-pressed` ring stays |
| Nav item | bg `rgba(255,255,255,.12)`, text to full topbar ink, 2px underline in accent |
| Table / leaderboard row | bg `--rt-accent-soft`, name underlines |
| Bill card / player card | border to accent, title underlines, chevron nudges 2px |
| HP chunk | brighten 12%, 2px `--rt-ink` outline, raise 2px |
| Icon button | bg `--rt-border-soft` |

## 3. Three top bar variants (`Header 1 | 2 | 3` toggle)

Shared rule: one bar, one job order. Left is brand and navigation, middle is context (month), right is utility. Month navigation lives INSIDE the header in all 3 (delete the separate floating month bar and the LED summary strip from the top; billed and tipped totals move to a quiet stat row at the top of Home content). Nav items: **Home, Bills, Ranks, Players**. Home is active on the home view; Bill Detail highlights Bills; Player Detail highlights Players. Role (Guest / Player / Admin), Light / Dark and Reset are the demo controls, never styled as primary nav.

The `Header 1 | 2 | 3` toggle itself is a dev affordance: a small fixed pill bottom-left (`fixed bottom-4 left-4`), 40px tall, labeled "Header", numbers 1 2 3, persisted in `localStorage` key `tq-r3-header`. It is not part of any header.

### Header 1: Command bar (single dense row, sticky, dark slab)

```
[Tabquest]  Home Bills Ranks Players      ( < Nov 2026 > )        [Sun|Moon] [Role: Admin v] [Reset]
```
- Single 56px row, ink slab full width, content max 1200px. Month is a pill in the center-left with prev and next arrows inside the pill and the label as a button that returns to current month. Role is a compact dropdown button (menu of Guest, Player, Admin) rather than a 3 segment control, so it takes 1 control of space. Theme is an icon-only toggle (Sun/Moon swap), `aria-label` required. Admin gets an accent "Collect (3)" button before Role.
- Mobile: nav collapses to a 5 icon bottom tab bar, month pill stays in the header.
- Character: efficient, closest to the old bar but half its clutter.

### Header 2: Floating cockpit capsule (segmented, detached)

```
          .----------------------------------------------------------------.
          | Tabquest | Home  Bills  Ranks  Players | < Nov 2026 > | Sun/Moon | ... |
          '----------------------------------------------------------------'
```
- Sticky at `top-3`, centered capsule (max 920px) on the page bg, chamfered corners (use `rt2-chamfer`), 2px ink border, `--rt-surface` fill (NOT dark), small hard shadow. The active nav item is a filled ink segment. Segments are separated by 1px `--rt-ui-border` dividers so it reads as one instrument cluster.
- Role and Reset live behind a single `...` menu button at the end of the capsule (popover with Guest / Player / Admin radio list, Reset demo, and the Light/Dark choice). Theme toggle stays visible as an icon.
- Page content starts 88px below the top so nothing hides under the capsule.
- Character: calm and spacious, the most distinctive.

### Header 3: Editorial split bar (nav primary, demo tucked in a corner)

```
[Tabquest]   Home   Bills   Ranks   Players                          Nov 2026  < >   
-----------------------------------------------------------------------------------
                                                    demo: Guest Player Admin | Sun | Reset
```
- Two tiers. Tier 1 (56px, `--rt-surface`, 2px bottom ink border): brand left, big readable nav in 17px bold with a 3px accent underline on the active item, month on the right as plain text with two arrow icon buttons. Tier 2 is a 32px strip, `--rt-surface-alt`, right-aligned, 14px: the demo controls (Guest, Player, Admin segment, theme, Reset) labeled "Demo". It scrolls away (not sticky); only tier 1 is sticky. This keeps the demo out of primary navigation and visually quiet.
- Character: lighter and more readable than the slab, most "app-like".

## 4. Home upgrades

Layout (desktop 12 col, keep existing section order: stat row, Who are you roster, Bills to Pay, Ranks, Mission Log):

```
+--------------------------------------------------------------+
| Billed Rp...  | Tipped Rp...  | Open Rp... (n players)        |  stat row (replaces LED strip)
+--------------------------------------------------------------+
| Who are you?  [Sinta][Raka][Dewi][Bima*][Nadya][Farhan] ->   |
+---------------------+----------------------------------------+
| PAY-ALL (4 cols)    | BILLS TO PAY (8 cols)                  |
|  Rp92.400           |  bill card: merchant, date, remaining  |
|  [Exact][R5k][R10k] |   Boss Armor HP bar (hover chunks)     |
|  Custom [Rp ____ ]  |   -> click anywhere on card = Bill Detail
|  Tip rank box       |                                        |
|  [Copy] [Notify]    |                                        |
+---------------------+----------------------------------------+
```

### 4.1 Pay-All: amount controls (in this order, top to bottom)
1. Hero owed amount (Display, 56px).
2. Chip stack: Exact (default selected), Round 5k, Round 10k, Clean, Generous (existing `getRoundUpOptions`). Each chip row shows label left, amount right (17px), `+RpX tip` in teal-ink.
3. **Custom amount input** directly under the chips. Label "Custom amount" (14px, above the field). Field: 48px tall, `Rp` prefix glyph inside, `inputMode="numeric"`, thousands separators as you type (`92.400`), value mirrors `selectedAmount` so selecting a chip fills the field and typing deselects all chips. Error states: below owed shows inline "Below your split by RpX. Notify will report an underpay." (accent-ink, icon, not blocking; tip floors at 0). Clear button (X, 44px) inside the field right. Enter key triggers Notify.
4. Tip rank box (4.2).
5. Copy digits button and Notify button (equal width row, Notify is the accent fill). Both read `selectedAmount` live, so label updates: `Copy 100000`, `Notify RpX`. Account block (BCA number with its own Copy) stays below.

### 4.2 Tip rank box (two targets, one tap each)
```
+------------------------------------------+
| Tip rank        #4  ->  #3 (after this)  |
| Passes Dewi                              |
| ---------------------------------------- |
| [ Take next rank (#3)   +Rp7.700 tip  ]  |   click: sets amount = owed + 7.700
| [ Take #1 (Sinta)      +Rp22.200 tip  ]  |   click: sets amount = owed + 22.200
+------------------------------------------+
```
- Targets are computed from `getTipLeaderboard`: `tipToNext = leaderAbove.monthlyTips - you.monthlyTips + 1` (strictly beats), `tipToFirst = leader.monthlyTips - you.monthlyTips + 1`. Hide a chip when the user is already at that rank (show "You hold #1" in teal-ink with a Crown). If the next rank is #1, show a single chip "Take #1".
- Chip is a full-width button, 48px, ink border, hover per table. Active (amount equals that target) turns ink fill and shows a Check. Clicking an active chip returns to Exact (same toggle behavior as existing chips).
- The "#4 to #3" line reads `projectTipRank(players, you.id, selectedTip)`, so the box reacts to the custom input. If `selectedTip` is 0 the line reads `#4 (no change)`.
- Copy: "Take next rank" and "Take #1", not "Steal". Include the exact tip in Rupiah at 17px mono.

### 4.3 Admin Collect-All drawer: custom received amount
Each debtor row (name, avatar, owed, claimed badge if pending):
```
Bima   owes Rp92.400   claimed Rp100.000 (12m ago)
[ Claimed Rp100.000 ] [ Exact Rp92.400 ]   Received [ Rp ______ ]   Tip preview: +Rp7.600 
                                           [ Confirm payment ]
```
- Received input is the same component as 4.1 (prefix, separators, clear). Quick-fill buttons set the field; typing deselects them. `Claimed` only appears when a claim exists, and is pre-selected when it does; otherwise Exact is pre-selected.
- Tip preview is live: positive shows `+RpX tip` (teal-ink with Plus icon), zero shows `Exact`, negative shows `Short RpX` (accent-ink with Warning icon) and Confirm becomes secondary style with label "Confirm short payment".
- Confirm calls the existing `handleAdminConfirm(debtor, received)`.
- Drawer width 520px, header stats: open total and pending count in 17px mono. Close on Escape and scrim click.

### 4.4 Boss Armor HP bar tooltip (shared component `HpBar`, used on Home and Bill Detail)
- One chunk per player split on a bill, width proportional to `totalOwed`, 28px tall (40px on Bill Detail), 2px gaps. Chunk is a focusable `button` (`aria-describedby` tooltip), `cursor-pointer`. Clicking a chunk opens that player's Player Detail.
- Chunk states (fill, plus glyph so color is not the only cue): Paid (teal fill, Check), Pending (amber fill, Clock, a pending claim), Unpaid (accent fill, Warning). Pattern: Paid is solid, Pending is diagonal hatch, Unpaid is solid plus a dashed top edge. Add a text-only legend row (14px) under the bar on first card.
- Hover or focus: chunk brightens 12%, gets a 2px ink outline (light) or 2px #EEF2F6 outline (dark), rises 2px. Others dim to 0.55 opacity. Mouse leave or blur reverses over 120ms.
- Tooltip: 14px text, bg `--rt-tip-bg`, 1px border, 10px radius-free chamfer, 10px padding, min 200px, max 260px, tail pointing at the chunk center, `z-30`, `pointer-events: none`. Anchor it above the chunk center; flip below if it would clip the top, clamp horizontally to the viewport (use `getBoundingClientRect`; no library needed). Appears 80ms after hover and immediately on focus, `Escape` dismisses.
- Content (all lines readable, 14px, name 16px bold):
```
Bima                                   (16px bold)
Owes   Rp38.200                        (mono 17px)
Status Unpaid                          icon + word, tone color
-- if Paid:    Paid Rp45.000   Tip +Rp6.800
-- if Pending: Claimed Rp100.000 (12m ago)  Awaiting admin
-- if Unpaid:  Nothing reported yet
Click to open Bima's dossier           (13px muted-on-tooltip, #C5CCD6 on #1F2329 = 9.8)
```
- Touch: first tap shows tooltip as a sticky bubble, second tap on the same chunk navigates. Tap elsewhere dismisses.

## 5. New pages (shared page frame)

Every page: header (chosen variant), breadcrumb back link row (`< Home`, 15px, cursor-pointer), page title in Display 40px, then content in a max 1200px column. Section order inside a page is a single reading path; no carousels.

### 5.1 Bill Detail (`#/b/:publicId`)
```
< Home / Bills        Kopi Tuku Kemang                    [Receipt photo] [Pay all my bills]
                      Nov 21 | Total Rp131.000 | 2 of 4 paid
+---------------------------------------------------------+
| BOSS ARMOR  [###paid###][##paid##][#unpaid#][###unpaid###]   (40px, hover tooltips)
| legend: Paid Pending Unpaid        Remaining Rp78.000    |
+----------------------------+----------------------------+
| Summary (5 cols)           | Per-player cards (7 cols)  |
|  Merchant, date            |  [Sinta card] [Dewi card]  |
|  Subtotal  Rp230.000       |  [Bima card]  [Nadya card] |
|  Voucher  -Rp103.500       |                            |
|  Fees      Rp4.500         |                            |
|  Total    Rp131.000        |                            |
|  Equal fee share Rp1.125   |                            |
+----------------------------+----------------------------+
```
- Header actions: **Receipt photo** (outlined button with Receipt icon) opens a modal; **Pay all my bills** (accent fill) is shown only for Player role with `owed > 0`: click sets view to Home, scrolls to `#bills` and sets Exact selected. Admin sees "Open Collect desk" instead. Guest sees neither.
- Summary: a ledger table, rows left label and right mono amount (17px), a heavy 2px rule above Total, Total in Display 32px. Voucher in teal-ink, fees in muted. Also show "Voucher share is proportional to items; fee share is equal" as a single 14px helper line.
- Player cards: avatar chip (initials, 40px), name, status pill, then rows: each item `qty x name` with price, Subtotal, Voucher share (teal-ink, negative), Equal fee share, then a heavy rule and **Owes RpX** (18px mono bold). Paid cards add `Paid RpY` and a tip badge `+RpZ tip` (teal-ink pill with Heart icon) when `paidAmount > totalOwed`. Unpaid cards show a quiet dashed border. Whole card header is a button to Player Detail (hover per table). Highlight the active pilot's card with a 3px accent left edge and "You" tag.
- **Receipt modal**: centered 480px dialog, scrim `rgba(0,0,0,.6)`, Esc and scrim close, focus trap, close X (44px). Inside: a mock thermal receipt on a white paper tile (always #FFFFFF with #1A1A1A text, 15px mono, dashed tear edges via CSS, slight 1.5deg rotation, no images needed): merchant header, date, one line per item aggregated across players, Subtotal, Voucher, Fees, Total, "Thank you". Below it a bar: "Download" is non-functional, label it "Mock receipt" in 14px. Use `role="dialog" aria-modal`.

### 5.2 Player Detail (`#/players/:playerId`)
```
< Home / Players
+--------------------------------------------------------------------+
| (BM)  Bima  @bima                 Tier: Regular   Badge: Discount hunter |
|       Lunch Raider, Lv 9                           Spender #4  Tipper #4 |
+----------+-----------+------------------+--------------------------+
| Total    | Monthly   | Discount saved   | Open balance             |
| spend    | tips      | Rp130.275        | Rp92.400                 |
| Rp394.200| Rp16.400  | 33.1% saved      | 3 bills                  |
|          | 7.3% jar  |                  |                          |
+----------+-----------+------------------+--------------------------+
| ORDER HISTORY (8 cols)                    | PAY-ALL CARD (4 cols, sticky)
|  Nov 23 Ayam Geprek Bensu  Rp22.400 Unpaid| Rp92.400  [Exact][R5k]..
|  Nov 22 Bakmi GM Express   Rp38.200 Unpaid| Custom [Rp ____]
|  Nov 21 Kopi Tuku Kemang   Rp31.800 Unpaid| Take next rank / Take #1
|  Nov 18 Fore Coffee        Rp39.333 Paid+tip| [Copy] [Notify]
+--------------------------------------------+
```
- Tier uses `tierForSpend(monthlySpend, topSpend)` with the existing 4 tier styles (but sizes 14px with an icon, text per audited ink tokens). Badge pill uses `BadgeIcon` at 16px. Show the best tip note as a quote line: "Best tip: Rounded Fore Coffee Rp43.500 to Rp50.000" (15px, italic is NOT needed).
- Stat cards are 4 equal cards with a label (14px), value (Display 32px or mono 24px for Rupiah) and a one-line sub-metric (14px). Monthly Tips sub: `% of jar` = `monthlyTips / totalTipPot`, 1 decimal. Discount saved sub: `savedPct` with a "gap to next spender: Rp... to take #N" line from `gapToNextSpend`.
- Pay-All card is the same component as Home 4.1 and 4.2, parameterized by player (so it works for any player the user views, with Copy and Notify working). Hide it when `owed` is 0 and show "All clear" with the tips total.
- Order history: derived from `bills` where a split has that `playerId`, sorted by date descending. Row: date, merchant (button to Bill Detail), items summary (truncate after 1 line, `title` attr), owed, status pill, `+RpX tip` for paid-with-tip. Row hover per table. Empty state: "No orders this month. Orders appear here after the next group order."

### 5.3 All Ranks (`#/ranks`)
```
< Home                  All ranks                        Search [ ________ ]
 [ Spender | Tipper | Side by side ]    Tier [All v]   Sort [Rank v]
+-------------------------------------------------------------------------+
| #  Player            Tier        Badge         Spent       Discount   Steal #N        |
| 1  Raka  @raka       Final Boss  Top spender   Rp542.000   44.2%      You lead        |
| 2  Sinta ...                                                          Steal #1 for Rp55.500 |
+-------------------------------------------------------------------------+
| #  Player          Tipped      % of jar   Steal #N         Best tip                       |
| 1  Sinta           Rp38.500    28.4%      Leader           Rounded Kopi Tuku Rp36.400...  |
+-------------------------------------------------------------------------+
```
- Tabs (real `role="tablist"`, 48px segments): **Spender**, **Tipper**, **Side by side** (default on screens >= 1100px, two full tables in 2 columns, falls back to Spender tab on narrower). Controls row: search (name or handle, 48px, X clear), tier filter (All / Final Boss / Miniboss / Regular / Rookie as chips), sort select (Rank, Name, Spend, Tips).
- Spender table columns: Rank (Display numerals 28px, crown for #1), Player (avatar, name, handle), Tier pill, Badge pill, Spent, Discount saved + `%`, `Steal #N for RpX` (from `gapToNextSpend`; the leader reads "Holds #1" with a Crown). Tipper table columns: Rank, Player, Tipped, `% of jar`, `Steal #N for RpX` (tip gap to the player above, plus 1), Best-tip note (15px, wraps to 2 lines max).
- Whole row is a button to Player Detail (`cursor-pointer`, hover per table, `role="link"` semantic via `<a href="#/players/..">`). Pilot's own row is highlighted with an accent left edge and "You". Rank change preview is not needed here.
- Footer line: `{n} players, jar total RpX` (15px). Empty search: "No pilots match 'xyz'. Clear search" with a button.
- Mobile: tables become stacked rows (rank and name top line, stats as 2 column definition list); keep every stat visible, no hidden columns.

## 6. Navigation and data wiring
- Clicking: bill card, bill title, order-history merchant, HP bar footer, Mission Log row opens Bill Detail. Player name, avatar, roster "dossier" icon, tooltip body, HP chunk, rank row opens Player Detail. "See all ranks" in the Home Ranks header opens Ranks. Every page keeps header nav so it is 1 click back.
- Home Ranks block shows top 3 for each board with "See all ranks" (accent-ink text link, 16px, underline on hover).
- Scroll to top on view change; move focus to the `h1` (`tabIndex={-1}`) for keyboard users and announce via the existing live region.
- Tip math lives in 1 helper added to `mock-data.ts`: `getTipTargets(players, playerId) -> { toNext: number | null, toFirst: number | null, nextName, firstName }` so Home, Player Detail and Ranks all agree.

## 7. Implementation checklist
1. Swap tokens (section 2), delete tiny type, add `rt-ui-border` for inputs and chips.
2. Extract `HpBar`, `PayAllCard`, `CurrencyInput`, `Pill`, `PlayerAvatar`, `AppHeader` (3 variants) into `src/prototypes/telemetry/` modules; keep `VariantITelemetryV2` as the entry that owns `view`, theme, role and header state.
3. Header toggle persists, defaults to 1.
4. Verify in both themes: tab through each page, check each hover, check each focus ring, check no text under 13px (`grep -n "text-\[1[01]px\]\|text-xs"` must return nothing in the suite).
5. Re-run the contrast script on any token you change; every text pair must be at least 4.5, every outline or chunk at least 3.

## 8. Self-critique (what was cut or changed)
- Dropped the LED summary strip and floating month bar: month is now header-only and totals are one quiet stat row. Reason: the user disliked the stack, and 3 stacked bars was the main noise.
- Replaced orange as a text color everywhere (#FF5B1F on cream is under 3:1) with a darker accent-ink; the brand orange survives as fills and hard shadows.
- Rejected a generic "stat card + gradient" profile hero for Player Detail; the dossier leads with identity (avatar, tier, badge, ranks) and puts spend at card level, so it reads as a pilot file rather than a SaaS profile.
- Rejected uppercase tracked eyebrow labels and `A · B · C` meta strings; labels are plain sentence case.
- Spent boldness once: Header 2 (floating chamfered capsule). The other two stay conventional so the comparison is meaningful.
