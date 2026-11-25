# Tabquest v2: Design Direction & UI Implementation Plan

- **Status:** Approved direction, ready for Phase 5 (Neon)
- **Winner:** Opus JRPG "Battle Menu" ([variant-e-opus.tsx](../src/prototypes/variant-e-opus.tsx))
- **Scope:** Visual system, screen blueprints, build order, guardrails. No code is changed by this document.
- **Vocabulary (strict):** Player, Account, Bill, Split, Allocation, Tip, Transfer Claim, Spending. See [CONTEXT.md](../CONTEXT.md).

> [!IMPORTANT]
> Game metaphor lives in **chrome and motion** (windows, HP bars, cursor, KO stamp, damage pops), never in the **data vocabulary**. UI copy for money concepts uses the domain terms: "Split", "Tip", "Transfer Claim", "Spending". Never write "round-up" or "overpay" as a noun for a Tip. Game flavor words ("boss", "hit", "defeated", "party") are allowed only as light labels around a Bill (a Bill is the boss, a Player's Split is their hit).

---

## 0. Copy and vocabulary map

| Domain term | Allowed UI wording | Never |
| --- | --- | --- |
| Player | "Player", "you", "party" (group of Players on a Bill) | Customer, participant, user (for a Player) |
| Account | "Sign in with Google", "Account" (admin settings only) | Profile login, member |
| Bill | "Bill" in forms and admin; "boss" as flavor in Home and public headings | Order, invoice |
| Split | "Your Split", "Split preview", "Your hit" (flavor, next to a Split amount) | Share (for the whole amount), portion |
| Allocation | "Allocate", "Allocations" (editor only) | Assignment |
| Tip | "Tip", "+Rp2.000 tip", "Tip Rank" | Round-up (as noun), overpay, donation |
| Transfer Claim | "I've transferred, notify admin", "Reported Rp100.000" | Payment proof, receipt |
| Spending | "Spending rank", "Spending this month" | Expenses, bought |

Component name `RoundUpChipBar` is kept as an internal code name only. Visible heading above it reads **"Add a Tip?"** with helper text "Every rupiah over your Split counts as a Tip."

Punctuation rules (copy and code comments): no em-dashes anywhere, no middot (`·`) separators, sentence case, no all-caps tracked eyebrows. Use commas ("Nov 12, 3 of 5 hits landed") or hyphens.

---

## 1. Design tokens and visual system

### 1.1 Tailwind v4 `@theme` tokens

Put these in `src/styles.css` (replacing the Variant A/B/C prototype classes once prototypes are archived). Tokens become utilities automatically (`bg-surface`, `text-ink`, `border-cream`, `text-hp`, etc.).

```css
@import "tailwindcss";

@theme {
  /* Canvas and surfaces */
  --color-canvas: #0a0d22;            /* outer page */
  --color-ink: #070918;               /* deepest: borders, bevel, drop shadow, bar trough */
  --color-surface-top: #1f2760;       /* window gradient top */
  --color-surface: #141a47;           /* window gradient mid (main navy) */
  --color-surface-bottom: #10153a;    /* window gradient bottom */
  --color-surface-inset: rgb(7 9 24 / 0.55); /* sunken rows, chips, inputs */
  --color-surface-row: rgb(16 21 58 / 0.7);  /* compact list rows (Defeated) */

  /* Text */
  --color-cream: #f3ecd6;             /* primary text, window border */
  --color-muted: #a3aad3;             /* secondary text (>= 7:1 on surface) */
  --color-dim: #8b92bd;               /* tertiary text, raised from prototype #6b729c to pass 4.5:1 */

  /* Semantic */
  --color-hp: #ff4566;                /* unpaid Split, danger */
  --color-hp-deep: #b3123a;           /* HP gradient bottom */
  --color-hp-hi: #ff9aac;             /* HP gradient top */
  --color-gold: #ffcd4a;              /* Tip, primary CTA, cursor, "you" */
  --color-gold-deep: #a27a12;         /* CTA side-shadow */
  --color-mint: #5ef0a5;              /* paid, confirm, positive Tip delta */
  --color-admin: #5cc4ff;             /* admin blue: Transfer Claims, admin chrome, links to admin */
  --color-admin-deep: #1f6c99;        /* admin button side-shadow */

  /* Lines */
  --color-line: rgb(243 236 214 / 0.18);   /* default hairline on navy */
  --color-line-strong: rgb(243 236 214 / 0.35);

  /* Fonts */
  --font-display: "Chakra Petch", system-ui, sans-serif;
  --font-body: "Plus Jakarta Sans", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  /* Radii */
  --radius-window: 12px;
  --radius-control: 8px;
  --radius-bar: 6px;

  /* Shadows (composite, reusable) */
  --shadow-window:
    inset 0 0 0 2px var(--color-ink),
    inset 0 0 0 3px rgb(243 236 214 / 0.18),
    0 6px 0 var(--color-ink),
    0 10px 24px rgb(0 0 0 / 0.45);
  --shadow-press: 0 3px 0 var(--color-ink);           /* secondary button */
  --shadow-cta: 0 4px 0 #8a6510, 0 0 0 2px var(--color-gold);

  /* Motion */
  --ease-snap: cubic-bezier(0.2, 0.9, 0.3, 1);
  --animate-cursor: cursor-bob 0.9s ease-in-out infinite;
  --animate-stripes: hp-stripes 1.1s linear infinite;
  --animate-strike: hp-strike 0.45s ease-in-out infinite;
  --animate-damage: damage-pop 1.6s ease-out forwards;
  --animate-drawer: drawer-in 0.22s ease-out;

  @keyframes cursor-bob { 0%, 100% { transform: translateX(0) } 50% { transform: translateX(3px) } }
  @keyframes hp-stripes { from { background-position: 0 0 } to { background-position: 26px 0 } }
  @keyframes hp-strike { 0%, 100% { filter: brightness(1) } 50% { filter: brightness(2.1) saturate(0.4) } }
  @keyframes damage-pop {
    0% { opacity: 0; transform: translateY(8px) scale(0.9) }
    15% { opacity: 1; transform: translateY(0) scale(1.08) }
    100% { opacity: 0; transform: translateY(-38px) scale(1) }
  }
  @keyframes drawer-in { from { transform: translateX(100%) } to { transform: translateX(0) } }
}
```

Reusable utility classes (in `@layer components`):

```css
@layer base {
  html { background: var(--color-canvas); color: var(--color-cream); font-family: var(--font-body); }
  body {
    background-color: var(--color-canvas);
    background-image:
      radial-gradient(rgb(243 236 214 / 0.07) 1px, transparent 1px),
      radial-gradient(ellipse at 50% -10%, rgb(92 196 255 / 0.16), transparent 60%);
    background-size: 6px 6px, 100% 100%;
    background-attachment: fixed;
  }
  :focus-visible { outline: 3px solid var(--color-gold); outline-offset: 2px; border-radius: 4px; }
}

@layer components {
  .window {
    position: relative;
    border-radius: var(--radius-window);
    border: 2px solid var(--color-cream);
    background: linear-gradient(180deg, var(--color-surface-top) 0%, var(--color-surface) 55%, var(--color-surface-bottom) 100%);
    box-shadow: var(--shadow-window);
  }
  .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .hp-hatch-paid {
    background: repeating-linear-gradient(135deg, rgb(243 236 214 / 0.06) 0 3px, transparent 3px 7px);
  }
}
```

Keep the existing `.tnum` helper and the existing global `prefers-reduced-motion` block.

### 1.2 Surface recipe (what "Battle Menu" means in CSS)

- **Outer canvas:** `canvas` navy with a 6px cream dot grid at 7% plus one cyan radial glow at the top. Fixed background so it does not scroll-jank.
- **Window (`BattleWindow`):** navy vertical gradient, **2px cream border**, **inner ink ring (2px)**, **faint cream inner bevel (3px at 18%)**, **hard 6px ink drop shadow** (no blur), plus a soft 24px ambient shadow. This stacked ring is the double-border bevel. Do not reproduce it with `border` alone.
- **Accent override:** `accent` prop swaps the border color (gold = admin/focus, mint = all clear, admin blue = pending Transfer Claim, 55% cream = secondary window).
- **Sunken row:** `surface-inset` fill, 1px `line` border, radius 8px. Used for splits, destination cards, chip rails.
- **Buttons are physical:** 2px border, hard bottom shadow (3-4px), `active:translate-y-[2px]` or `3px`. No soft glows on buttons except the primary CTA's outer gold ring.

### 1.3 Color roles (strict)

| Role | Token | Used for | Never used for |
| --- | --- | --- | --- |
| Unpaid / damage | `hp` | HP fill, unpaid amounts, destructive | Decorative accents |
| Paid / drained | `hp-hatch-paid` (cream hatch on ink) | Drained HP chunks | Tip (do not tint mint) |
| Tip | `gold` for the Tip amount and CTA; `mint` for positive delta text ("+Rp2.000 tip", rank up) | Unpaid |
| Confirm / success | `mint` | Paid check, all-clear, rank improvement | Primary CTA fill |
| Admin / Transfer Claim | `admin` blue | Admin Collect desk, pending Transfer Claim, admin nav | Player-facing positive states |
| Text | `cream` (primary), `muted` (secondary), `dim` (tertiary, non-essential only) | | `dim` for any actionable or required info |

### 1.4 Typography

| Role | Font | Size and weight | Rule |
| --- | --- | --- | --- |
| Window titles, button labels, names, merchant | `font-display` (Chakra Petch) | 15-17px bold (titles), 13-16px semibold (buttons) | Sentence case |
| Hero amount ("You owe") | `font-mono` + `tabular-nums` | 44px mobile, 54px >= sm, bold, 3px ink text-shadow | One hero number per screen |
| Body, helper text, forms, table cells | `font-body` (Plus Jakarta Sans) | 13-14px, regular/semibold | Inputs never use display font |
| All Rupiah figures, counts in headers, ranks, claim timestamps, account numbers | `font-mono` + `tabular-nums` (`.num`) | 12-24px | Every `formatRupiah(...)` output, no exceptions |

Rules:

1. **Sentence case everywhere.** No `uppercase`, no `tracking-widest` eyebrows. Section titles are real headings ("Bosses still standing").
2. **No middot spam.** Do not join metadata with `·`. Use commas, hyphens, or separate lines. The prototype already replaces `" · "` in destination strings; the production destination field stores separate fields (see 2.6) so no replace hack is needed.
3. **Minimum text size 12px**, and only for tertiary metadata. Body text is 13px minimum on mobile, 14px preferred.
4. **Never `font-display` for paragraphs or form fields** (Chakra Petch is poor for long reading and for inputs).
5. Load fonts with `font-display: swap`; preload Chakra Petch 600/700 and JetBrains Mono 500/700 only. Plus Jakarta Sans 400/600.

### 1.5 Signature primitives to extract

Create under `src/components/battle/` (barrel `index.ts`). All are presentational and token-driven; no inline hex values.

#### `BattleWindow`

```ts
type BattleWindowProps = {
  as?: "div" | "section" | "article" | "aside"
  accent?: "cream" | "gold" | "mint" | "admin" | "muted"  // border color
  padding?: "none" | "sm" | "md"                           // p-3 / p-4 / p-4 sm:p-5
  className?: string
  children: ReactNode
}
```

Plus `WindowTitle({ icon, children, right, level = 2 })` that renders the `h2`, gold icon, optional right slot (count text like "3 alive" in mono).

#### `BossHpBar`

The signature mechanic: **one bar per Bill; every Player's Split is a proportional chunk** of the bar.

```ts
type HpChunk = {
  playerId: string
  name: string
  totalOwed: number        // Split, integer rupiah
  status: "paid" | "unpaid"
}
type BossHpBarProps = {
  chunks: HpChunk[]
  youId?: string
  size?: "lg" | "sm"       // 22px (cards, public page) or 10px (Defeated rows, admin lists)
  strike?: boolean         // flash "you" chunk while the notify CTA is hovered/focused
  preview?: { playerId: string; amount: number } | null // hover damage preview, see below
  label: string            // merchant, used in aria-label
}
```

Rendering rules:

- Width of chunk = `totalOwed / sum(totalOwed) * 100%`. Use `flex` with explicit `width` percentages; chunk dividers are a 2px `ink` `border-right` (omit on last).
- **Unpaid chunk:** HP gradient (`hp-hi` to `hp` at 38% to `hp-deep`), with a 3px white 45% highlight line on top when `size="lg"`.
- **Your unpaid chunk:** same gradient plus moving diagonal stripes (`animate-stripes`, 26px). Stripes are the "this one is you" signal, so do not stripe any other chunk.
- **Paid (drained) chunk:** transparent over the `ink` trough with `hp-hatch-paid` cream hatch. Hatch, not a color, so state survives color-blindness.
- **Trough:** `ink` fill, 2px cream border, 2px outer ink ring, radius 6px, `overflow-hidden`.
- **Hover damage preview (new vs prototype):** hovering or focusing a chunk (or the Player's "Your hit" amount, or the notify CTA for your own chunk) shows a ghost of what the bar would look like after that Player pays: the chunk gets the `strike` flash and its fill fades to hatch at 40% opacity. Also render a tooltip chip above the chunk: `"{name}: Rp12.000, unpaid"`. On touch devices there is no hover; tapping a chunk toggles the tooltip for 2.5 seconds (it must not navigate or expand the card).
- **Floating damage pop (`DamagePop`):** a mono gold `-Rp12.000` that rises 38px and fades over 1.6s (`animate-damage`). Anchored to the chunk's center (for per-Bill) or the top-right of the Pay-All window (for Pay All). Fire it once on successful submit of a Transfer Claim (Home) and on each confirmed payment (Admin desk row). Key it by an incrementing counter so repeated actions replay it.
- **A11y:** wrapper `role="meter"` with `aria-valuemin=0`, `aria-valuemax=total`, `aria-valuenow=remaining`, `aria-label="{merchant} remaining balance"`, `aria-valuetext="Rp45.000 of Rp120.000 still unpaid"`. Chunks are `aria-hidden`; the same information appears in the expanded split list.
- Edge cases: total 0 renders a full hatch trough; a single-Player Bill renders one chunk; Players with sub-2% chunks get a minimum visual width of 6px (borrow from the largest chunk) so they remain hoverable. Keep the `aria` numbers true to real amounts.

#### `MenuCursor`

Gold filled caret (`CaretRight`, 14px) with `animate-cursor`. Placement rules: prefix the **selected/"you" row** or the **active round-up chip**, and the status/battle-log line. At most one cursor visible per window. Never place on every row.

#### `KoStamp`

Compact stamp for settled Bills: 40x32px, rotated -6deg, 2px `hp` border, display font "KO", 85% opacity, radius 4px. On the Public Bill page for a fully paid Bill use the large variant (64x48, rotated -8deg) over the top-right of the Boss window, and play a one-time scale-in (160ms). The stamp is purely decorative: `aria-hidden` and the status is repeated in text ("Fully paid").

#### `RoundUpChipBar`

```ts
type TipOption = { label: string; amount: number; tip: number } // from getRoundUpOptions(owed)
type RoundUpChipBarProps = {
  options: TipOption[]
  value: number                  // selected index
  onChange: (i: number) => void
  disabled?: boolean
}
```

- Renders a `role="radiogroup"` of chips (`role="radio"`, arrow-key navigation, roving tabindex).
- Chip: 8px radius, 2px border, hard 3px bottom shadow. **Active chip:** gold fill, ink text, gold-deep shadow, with `MenuCursor`-style caret on the left. Inactive: `surface-inset` fill, 25% cream border.
- Content: label (display, 13px semibold: "Exact", "Round 5k", "Round 10k") over amount line (mono 12px: `+Rp2.000` for tips, full amount for Exact).
- Chip row wraps (`flex-wrap gap-2`). Minimum chip hit area 44x44px.

Other small shared pieces to extract at the same time: `Avatar` (initials tile, 8px radius, gold gradient, ring prop), `LeaderboardCard`, `SplitList` (the per-Player breakdown), `TipRankProjection` (live Tip Rank jump row), `AmountText` (mono + tabular + `formatRupiah`), `StatusLine` (battle log, `aria-live="polite"`), `PrimaryButton` / `SecondaryButton` / `AdminButton` (physical buttons), `LockedNotice` (dashed border guest state).

### 1.6 Motion and accessibility guardrails

**Motion**

- Allowed animations: menu cursor bob, own-chunk stripes, strike flash (only while the notify CTA is hovered/focused), damage pop, drawer slide, KO scale-in, chevron rotate, HP width transition (500ms).
- Everything else is static. No parallax, no screen shake, no looping glows, no confetti.
- **`prefers-reduced-motion: reduce`:** the global rule in `styles.css` stays. In addition: `animate-stripes`, `animate-cursor`, `animate-strike` are disabled outright (not just shortened); damage pop becomes a static gold `-RpX` label that stays 1.2s then disappears with no transform; drawer appears with no slide. State must still be distinguishable without motion (stripes are a bonus; "(you)" text and gold row background remain).
- No animation may exceed 2s or loop for more than the lifetime of the element on screen.

**Focus and keyboard**

- Global `:focus-visible`: 3px gold outline, 2px offset. On gold surfaces (active chip, primary CTA) use an ink outline instead (`outline-ink`) so the ring is visible.
- Every interactive element is a real `button` or `a`. Expandable Bill cards: `button[aria-expanded][aria-controls]`. Drawer: `role="dialog" aria-modal="true"`, focus moves to the close button on open, trapped inside, Esc closes, focus returns to the trigger.
- Tab order follows visual order (Home: top bar, Pay-All window, Bosses, Tip Rank, Spending Rank, Defeated).
- Hit targets: 44x44px minimum on mobile (chips, expand rows, top bar buttons). Visually small controls get padding, not smaller hit areas.

**Contrast minimums**

- Body and form text >= 4.5:1; large text (>= 18px or 14px bold) and UI borders >= 3:1.
- Verified pairs: cream on navy (about 12:1), muted `#a3aad3` on navy (about 7:1), gold on navy (about 10:1), mint on navy (about 11:1), hp `#ff4566` on navy (about 4.6:1, use only for amounts at 13px+ semibold or with an icon), ink on gold (about 11:1), admin blue on navy (about 8:1).
- **`dim` was raised to `#8b92bd`** (prototype `#6b729c` was about 3.3:1). Use `dim` only for non-essential metadata.
- Never convey state by color alone: paid = check icon + hatch + "paid" text; unpaid = sword icon + HP fill; your row = "(you)" text + cursor.
- Form fields on navy: inputs get `surface-inset` fill, 2px `line-strong` border, cream text, `muted` placeholder text; error state = `hp` border plus an inline text message and icon.

---

## 2. Screen-by-screen blueprint

### 2.0 Shared layout

- **App shell:** sticky top bar (`canvas` 88% with `backdrop-blur`, 2px ink bottom border) containing the logo, nav, and auth control. Main column: `mx-auto max-w-3xl px-4`, `space-y-4`, bottom padding `pb-32` (room for mobile browser chrome). Admin routes use `max-w-5xl` (see 2.4).
- **Breakpoints:** design at 360px and 390px first. Tablet/desktop only widens the column and lets the two leaderboards sit side by side (`md:grid-cols-2`).
- **Top bar (all public screens):**
  - Left: logo (fork-and-knife icon in gold + "Tabquest" display bold).
  - Right, **guest:** "Sign in with Google" button (secondary style, Google "G" mark).
  - Right, **signed-in user:** `Avatar` + first name button opening a small menu ("Sign out"). If the Account is linked to a Player, show Player name; if not linked, show Account name plus a muted "Not linked to a Player yet" line in the menu.
  - **Admin button:** rendered **only when session `role === "admin"`** (single admin, `ADMIN_EMAIL`). Admin blue chip: shield icon + "Admin". Never render it, a disabled version, or a hint for non-admins. Route guards still enforce on the server.
  - The prototype's role switcher and "Who are you?" Player picker are **prototype-only**. Do not ship them. Guests see public data from the Player view they choose in-page (see 2.1 "Guest view as Player"), signed-in linked Players see their own.
- **Battle log line (`StatusLine`):** single-line mono 12px under the Pay-All window showing the last action ("Notified admin: Rp100.000"). Optional, `aria-live="polite"`. Drop it if it feels like noise in review; it carries no unique information.

### 2.1 Home `/`

Single scroll, strict priority: **1. Your turn (Pay All), 2. Bosses still standing (Bills to Pay), 3. Tip Rank and Spending Rank, 4. Defeated bosses (Old Bills).**

```
TopBar
[Admin: Open Collect desk]   (admin only, optional shortcut, see 2.3)
Window: Your turn  (Pay All)
StatusLine
Section: Bosses still standing
Section: Terima Kasih Orang Baik | Spending rank   (side by side >= md)
Section: Defeated bosses
```

**A. Pay-All window ("Your turn")**

Visible to everyone; content depends on viewer state. Data: the viewer's Player (linked Account, or guest-selected Player), unpaid Splits across all Bills.

1. **Header row:** Avatar (gold ring), "{Name}'s turn, Lv {level} {title}" muted, "{n} bosses waiting for your hit" display semibold. Singular: "1 boss waiting". If the Player has no level/title in v2 data, drop that fragment; do not invent fields.
2. **Amount row:** left "You owe" + hero mono `Rp...`; right "You'll send" mono gold (24px) with `+RpX tip` in mint when tip > 0.
3. **Tip chips:** heading "Add a Tip?" + helper text + `RoundUpChipBar`. Default pick: index 1 when available (the first rounded option), else 0.
4. **Live Tip Rank projection row (`TipRankProjection`):** heart icon + `Tip rank #N`. If the chosen Tip lifts rank: mint "up arrow #M, passing {names}" with mint-tinted background and dashed mint border. If not: muted text "Rp1.500 more Tip passes {next above}". If rank 1: "you are the kindest soul this month". Updates synchronously on chip change (pure client calc from the leaderboard + chosen Tip; no request).
5. **Actions row** (stack on mobile, `sm:grid-cols-[auto_1fr]`):
   - **Copy digits** (secondary button): copies raw integer digits only (`String(chosen.amount)`, no "Rp", no dots) so it pastes into a bank app. Label "Copy 102000" in mono; flips to a mint check and "Copied" for 1.4s. Works for guests too.
   - **Guest locked state:** dashed `LockedNotice` with lock icon: "Sign in to see where to transfer and notify admin". It is a button that starts Google sign-in. No destination details, bank names, QRIS, or even the field labels are rendered in the DOM for guests (not merely hidden by CSS); the server also must not send them (see HANDOFF auth rules).
   - **Signed-in, linked Player, no pending Transfer Claim:** primary gold CTA "I've transferred Rp102.000, notify admin" with sword icon. Hover/focus triggers `strike` on the viewer's HP chunks across all Boss bars. On click: optimistic disable, create Transfer Claim, fire `DamagePop` of `-Rp102.000` at the window's top-right, flip to the pending state.
   - **Pending Transfer Claim:** admin-blue info strip with hourglass: "You reported Rp102.000 {relative time}, waiting for admin". No second submit; show a small text button "Cancel report" only if the backend supports dismissing by the Player (otherwise omit).
   - **Signed-in but not linked to a Player:** replace the CTA with muted notice "Ask the admin to link your Google account to your Player so you can notify them." Still show Transfer Destination (the viewer is logged in) and Copy digits.
6. **Transfer Destination (logged-in only):** two sunken cards (`sm:grid-cols-2`), shown under the actions. Card 1: bank icon, bank name + account holder (muted 12px), account number (mono 15px semibold, with a small copy icon button for the number). Card 2: QR/e-wallet icon, "E-wallet or QRIS" label, e-wallet name and number (mono). If QRIS image is configured, tapping the card opens a lightbox with the image. Render only configured fields; hide a card if empty. Account numbers must be selectable (`select-all`) and wrap, never truncate on mobile. Data comes from the logged-in-only settings endpoint (2.6).
7. **All clear variant:** if `owed === 0`: window with mint accent, shield-check icon tile, "All clear, {name}!" (mint, display 22px), "No bosses left on your tab." Hide tip chips, projection, actions.
8. **Guest with no Player context:** if a guest has not picked a Player, show a compact "Who are you?" selector (Avatar chips) above this window. This is the only place the Player picker survives, and it is stored in `localStorage` only (no Account). Guests see their Splits but all transfer actions stay locked.

**B. Bosses still standing (Bills to Pay)**

- Section title via `WindowTitle` (skull icon) with right slot "`3 alive`" mono.
- Sorted: Bills where the viewer has an unpaid Split first, then by `orderDate` descending.
- `BossCard` (a `BattleWindow` with `padding="md"`):
  - Row 1: skull tile (hp-tinted 40px square), merchant (display bold, truncates), second line "`Nov 12, 3 of 5 hits landed`" (muted) plus gold ", almost down!" when remaining < 35%.
  - Right: if viewer has an unpaid Split: "Your hit" (muted 12px) + gold mono amount; if paid: mint "You hit" with check; if not on Bill: dim "Not in party" (use `muted`, it is informational).
  - Row 2: red "HP" display label + `BossHpBar size="lg"`.
  - Row 3: `Rp45.000 / Rp120.000` (remaining over total, mono) left; "See who ate what" with chevron right.
  - Whole card top area is one `button[aria-expanded]` toggling the **inline expandable splits**; the card also has a small "Share" icon button (copies the `/b/$publicId` URL) and an "Open" link to the public page. These two sit outside the toggle button to avoid nested interactive elements.
  - Expanded: `SplitList` (see 2.2 breakdown).
- Empty: mint centered "Every boss is down."

**C. Tip Rank and Spending Rank (side by side at >= 768px, stacked below)**

- Left: **"Terima Kasih Orang Baik"** (heart icon), subtitle "Tip rank this month, Rp48.000 in the jar". Bars: mint gradient. Right: **"Spending rank"** (trophy icon), subtitle "Everything ordered this month, paid or not". Bars: admin-blue gradient. (Matches CONTEXT: Spending counts what a Player owes, paid or not.)
- Row: rank (crown icon for #1, medal colors gold/silver/bronze for 1-3, then `dim` numerals), Avatar, name (+ gold "you" tag), mono value, 6px rounded progress bar scaled to the max in that board.
- Viewer row has gold 10% background and 1px gold 45% outline. Show full list when <= 8 Players; otherwise top 5 plus the viewer's row pinned below with "...".
- Tip board footer: the top Tipper's note quote line if the product supplies one (the prototype's `bestTipNote` is mock data). **If not in the v2 data model, omit the footer entirely.** Do not ship fake quotes.
- Bars animate width on load only (700ms), never on every render.

**D. Defeated bosses (Old Bills)**

- Section title (sword icon), right slot "`12 defeated`".
- `DefeatedRow`: sunken row; KO stamp (small), merchant (display 14px semibold), second line "`Nov 3, party of 5`" plus mint ", +Rp6.000 in tips"; right mono total; chevron. Beneath: `BossHpBar size="sm"` (fully hatched, chunk dividers still visible so you can see the party). Expanding shows `SplitList`.
- Show the 5 most recent; "Show older" text button reveals pages of 10 (client pagination over data already fetched, or server cursor if Bill count grows). Archived Bills are never shown here.
- Empty: muted "No fully paid bills yet."

### 2.2 Public Bill Split `/b/$publicId`

Standalone shareable boss encounter for group chat links. Public, no sign-in required, open graph friendly.

```
Slim header (logo left, auth control right, link "All bills" to /)
Window: Boss header (merchant, date, KoStamp when settled)
Window: HP and progress (BossHpBar lg + numbers)
Pay-all jump bar (conditional)
Receipt button
Per-Player list (SplitList, all expanded by default)
Footer: totals reconciliation (Subtotal, Voucher, Fees, Total)
```

1. **Boss header window:** skull tile, merchant (display 20px bold), date (muted), status chip: "Open, 3 of 5 hits landed" (hp) or "Fully paid" (mint) with large `KoStamp` when settled. A "Copy link" icon button sits top-right.
2. **HP window:** `BossHpBar size="lg"` with **hover damage preview enabled** (chunk tooltips), numbers `Rp45.000 / Rp120.000` remaining over Bill total, and a text line "Paid Rp75.000, Tips Rp6.000" (mono).
3. **Receipt lightbox button:** secondary button "View receipt" with receipt icon. Loads the image from `/api/public/bills/$publicId/image` (R2 via Worker) only on open (lazy). Lightbox: fullscreen overlay (`ink` 90%), image `object-contain`, pinch/scroll zoom (reuse `src/lib/zoom.ts` from v1), Esc/close button, `role="dialog"`. If the Bill has no image, hide the button. Respect redaction: the served image is already flattened, no client-side redaction logic here.
4. **Pay-all jump bar:** if the viewer (signed-in linked Player, or guest with a remembered Player in `localStorage` who is on this Bill) has **other** unpaid Bills beyond this one, show a gold-bordered strip: "You have {n} unpaid bills, Rp{owed} total" + primary CTA "Pay all my bills" which navigates to `/#pay` (Pay-All window anchor, scrolls into view and focuses the first chip). If this is the only unpaid Bill, the strip reads "Your hit: Rp12.000" with the same CTA. If the viewer is not on the Bill or has nothing unpaid, omit the strip.
5. **Per-Player breakdown (`SplitList`):** one sunken card per Player, ordered: viewer first, then unpaid by amount descending, then paid.
   - Header: name (display 14 semibold) with `MenuCursor` and gold "(you)" for the viewer; right side: mono amount colored `hp` with sword icon (unpaid) or mint with check (paid).
   - Item lines: `2x Nasi goreng ... Rp40.000` (quantity in mono, name in body, price in mono). For shared items show "shared with Dewi, Raka" in muted 12px.
   - Footer line (mono 12px, `muted`, wraps): `Voucher -Rp5.000`, `Fees +Rp2.500`; if paid: `Paid Rp12.000`, and a **Tip badge** when paid > Split: mint pill "+Rp1.000 tip" with heart icon. Negative Tip (underpaid) shows `muted` "paid Rp500 less" with no badge.
   - Rounding adjustment for the Player that `takesRounding` is shown as one more line "Rounding +Rp38" so totals reconcile (split v2 only).
6. **Totals reconciliation (bottom window, collapsed `details`):** Subtotal, each adjustment (Voucher, tax, delivery, service, other fees) as a line, and Bill total. Lets everyone verify the Split without opening the receipt.
7. **Loading, empty, errors:** skeleton windows (ink blocks with hatch), 404 uses a `KoStamp`-style "Bill not found" window with link home. Draft or archived Bills return 404 (never leak).
8. **Meta:** page title `"{merchant}, {date} | Tabquest"`, OG title "{merchant}: Rp45.000 still unpaid", no image of the receipt in OG (privacy).

### 2.3 Admin Collect-All Desk (slide-in drawer on `/`, plus `/admin` page)

One component (`CollectDesk`), two mounts:

- **Drawer** on Home for admin (opened by the "Open Collect desk" button under the top bar, with a blue count badge of pending Transfer Claims, and by the Admin chip menu).
- **Page** at `/admin` (the admin landing): same desk content, full width, plus quick links to Bills, Players, Settings.

**Drawer behavior:** right slide-over, `max-w-md`, full height, scrim `canvas` 70% (clicking closes), `animate-drawer`, `role="dialog" aria-modal`, focus trap, Esc closes. Page data refetches on open.

**Header window (gold accent for the desk, admin blue reserved for Transfer Claims):**

- Title "Collect desk" with shield icon + close button.
- "Still out on the field" muted + big mono outstanding total (32px).
- "`4 players, 2 reported a transfer`" muted.

**Player rows (sorted: pending Transfer Claims first, then by owed descending).** Each row is a `BattleWindow padding="sm"`; accent `admin` if it has a pending claim, else 50% cream.

1. Top line: Avatar, name (display 15 semibold), merchants list (muted 12px, truncated, with count "3 bills"), owed amount (mono gold bold).
2. **Pending Transfer Claim strip** (blue, hourglass): "Reported Rp102.000 {relative time}" plus mint "(+Rp2.000 tip)" when claim > owed. If claim < owed: hp text "(Rp3.000 short)".
3. **Actions:**
   - With claim: primary blue button **"Confirm Rp102.000"** (full width on mobile, one tap, no extra modal). Secondary "Dismiss" text button (marks claim `dismissed`).
   - Always: secondary **"Got exact Rp99.000"** one-tap button.
   - "Other amount" disclosure (small text button) expands an inline form: numeric input (mono, `inputmode="numeric"`, prefix "Rp"), **quick-fill chips** `Exact`, `Round 5k`, `Round 10k` (same chip style as `RoundUpChipBar`, rounding up from owed to the next 5.000/10.000), and a **live tip preview** line below: "Tip +Rp1.000, goes on {most recent unpaid bill}" in mint, or hp "Short by Rp500, leaves {n} bill unpaid" if the amount is below owed (follow server semantics: underpaying does not mark all paid). Submit: gold-bordered button "Mark all {n} bills paid".
4. **Optimistic and race rules:** after confirm, row shows a `DamagePop` of `-RpX`, the row collapses to a mint "Paid, thanks" strip for 1.5s then leaves the list. Disable both buttons on first click (double-click must not double credit; server also guards with `WHERE status = 'unpaid'`). If the server reports stale state (someone else paid), show an hp inline message "This tab changed, refreshed" and reload the row.
5. **Empty:** mint "Every boss is down. Nothing to collect."

Keep desk rows dense but with 44px buttons. Currency inputs: strip non-digits on input, show formatted on blur, send integers only.

### 2.4 Admin Bill Editor `/admin/bills/new` and `/admin/bills/$billId`

**Principle:** same tokens, same windows and buttons, but **flatter and denser**. The game chrome is applied at the shell level (window frames and section titles) while inner form areas drop to plain `surface-inset` panels with standard form controls. No HP-bar flash, no cursor, no damage pop here except one `DamagePop`-style toast on successful publish.

**Layout:** `max-w-5xl`. Desktop >= 1024px: two columns, left (editing, 60%) and right (sticky live Split preview, 40%). Mobile: single column with a sticky bottom bar (Split total, "Save draft", "Publish").

**Stepper** at the top (non-blocking, all steps reachable once a draft exists): 1 Receipt, 2 Items, 3 Adjustments, 4 Allocations, 5 Review and publish. Stepper is a horizontal list of pill buttons with `aria-current="step"`. Do not turn steps into a wizard that blocks; admin must be able to jump back.

**Step 1, Receipt upload and OCR**

- Drop zone (dashed cream border on `surface-inset`, 160px min height, "Drop a receipt or tap to choose"), accepts image types, <= 15 MiB, camera capture on mobile (`accept="image/*"`).
- After choosing: show the image in the **crop and redaction canvas** (below) and immediately **submit the OCR job** with the 2000px JPEG variant (`POST /api/admin/ocr/jobs`, returns `jobId`).
- **OCR job status (`OcrJobStatus`):** inline strip with spinner and states: "Uploading", "Reading receipt" (polls `GET /api/admin/ocr/jobs/:id` every 2.5s, aborts on unmount, backs off to 5s after 30s), "Done, filled 7 items" (mint) or "Could not read the receipt" (hp) with "Try again" and "Enter items manually" buttons. OCR never blocks editing: admin can start typing items while it runs; when results arrive, show a one-time banner "OCR found 7 items. Apply to empty rows" (merge only into empty state, never overwrite typed rows).
- Polling timeout at 90s with clear message; job id kept in draft state so a refresh resumes polling.

**Crop and PII redaction (`ReceiptCanvasEditor`)**

- `<canvas>`-based, port from v1 `image-edits.ts` and `redaction.ts`. Tools toolbar (icon buttons with text labels on desktop, icon + `aria-label` on mobile, 44px targets): **Crop**, **Black box** (draw rectangles), **Undo**, **Redo** (use `edit-history.ts`), **Reset**, **Zoom in/out** (`zoom.ts`).
- Redaction boxes stored as **fractional coordinates** (0 to 1 of image width/height) so they survive resizing; flatten onto the canvas on export (strips EXIF).
- Visual: boxes during editing are solid ink with a 1px gold dashed outline and handles (corner handles >= 20px hit area); exported pixels are pure black.
- Export produces two blobs: storage WebP (<= 3000px, q 0.9) and OCR JPEG (<= 2000px, q 0.85). Show resulting size in mono ("1.2 MB, 2400x3000").
- Always show a banner "Redact names, phone numbers, and addresses before publishing" until at least one box exists or admin ticks "Nothing to redact".
- Mobile: canvas fills width, toolbar sticky above it; pan with two fingers, draw with one when in Black box mode.

**Step 2, Items (high-density table)**

- A compact table (grid on desktop, stacked cards under 640px). Columns: Name (flex), Qty (72px), Unit price (120px, mono, right aligned), Line total (read-only mono). Row height 40px on desktop, rows have a delete icon button.
- **Keyboard-first:** `Enter` in the last cell adds a new row and focuses its Name; `Tab` moves left to right; `Shift+Enter` duplicates the row; paste of multiple lines into Name splits into rows ("name 2x 15000" parsing is optional, not required).
- Inputs: body font, 14px, `surface-inset`, 2px `line-strong` border; numeric inputs `inputmode="numeric"`, mono, right aligned, parse on blur, never reject mid-typing.
- Totals footer: Items subtotal (mono). Validation messages inline under the field, not toasts.

**Step 3, Adjustments**

- Rows of: Type (select: Voucher/discount, Tax, Delivery, Service, Other fee), Label, Amount (signed, mono). Show split rule helper: "Discounts and tax share proportionally. Delivery, service and other fees split equally per head (split v2)." as muted text.
- Running "Bill total" with a reconciliation check against the OCR/receipt total; if different show hp inline message "Items and adjustments differ from receipt total by Rp500".

**Step 4, Allocations**

- Matrix: rows = items, columns = Players on the Bill (horizontally scrollable on mobile with sticky first column). Cell = qty stepper (- / count / +, 44px) or, for shareable items, a **"Split evenly"** row action. Header chips let admin add Players to the Bill ("Add Player" combobox).
- **Quick actions:** "Everyone shares this item" (split item evenly among all selected), "Clear row". Unallocated quantity per item shown as hp "1 left" badge; must be zero before publish.
- Adjustment allocations (which Players share each adjustment): defaults to all Players on the Bill, editable via a Player checklist per adjustment.
- Highlight validation errors per row, not as a modal.

**Live Split preview (right column / bottom sheet on mobile)**

- Compact `BattleWindow` titled "Split preview": per Player row: Avatar, name, Split amount (mono) and a tiny chunk of an `BossHpBar size="sm"` at the top showing proportional chunks (re-uses the real component, so admin sees exactly what Players will see).
- Recalculates on every edit using the shared pure `split.ts` (v2 rules: flat fees per head, rounding to the `takesRounding` Player). Debounce 120ms. Show total and a reconciliation check ("Splits add up to Rp120.000"), turning hp if they do not.
- "Rounding goes to {Player}" muted line.

**Step 5, Review and publish**

- Summary: merchant name (text), order date (date input, defaults today in Asia/Jakarta via `time.ts`), receipt thumbnail, Player count, total, Splits.
- Buttons: secondary "Save draft", primary gold **"Publish bill"**. Publish is disabled with an explanatory list of blockers ("2 items not allocated", "No receipt image", "Redaction not confirmed") rather than silently greyed.
- On success: one-time `DamagePop`-style mint toast "Boss spawned" with a link to `/b/$publicId` and a "Copy share link" button. Redirect remains on the editor so admin can copy the link; do not auto-navigate away.
- Editing a published Bill (`/admin/bills/$billId`) shows a warning window (gold accent): "Players already paid on this Bill. Editing changes Splits." and a read-only "Payments recorded" summary. Archive/Delete live in an overflow menu with confirm dialogs (type-to-confirm not needed, simple confirm).

**Autosave:** debounced draft save every 2s with a small "Saved 10:42" text. Warn on navigation (`beforeunload`) if unsaved.

### 2.5 Admin Players `/admin/players`

`max-w-5xl`, `BattleWindow` per section, then dense list below.

- Top actions: "Add Player" primary, search input.
- **Desktop table / mobile cards:** columns: Avatar + name, Linked Account (Google email or "Not linked"), Pre-link email, `takesRounding` toggle, Outstanding (mono), row actions.
- **Link/unlink Google Account:**
  - Row action "Link Account" opens a modal listing signed-in Accounts not yet linked to a Player (name, email, avatar). Select one then "Link". Already-linked Accounts are excluded.
  - "Unlink" is a secondary button with confirm: "Unlink {email} from {Player}? They will no longer be able to notify transfers."
  - Linked rows show a mint "Linked" pill with the Google email in mono-small; unlinked rows show muted "Not linked".
- **Email pre-link:** inline text input per Player ("Pre-link email") with helper text "First verified Google sign-in with this email links automatically." Validate email format; on conflict with an existing linked Account show hp message. Saves on blur (with a small "Saved" tick) or via an explicit "Save" button on mobile.
- **`takesRounding` flag:** a labeled switch "Takes rounding" with helper "Leftover rupiah from Splits go to this Player." **Only one Player may have it** (enforce in UI by turning the previous one off with a confirm toast "Moved from {Name} to {Name}", and on the server). Switch is a real `role="switch"` with visible on/off text, not color only.
- **Add/Edit Player modal:** name, pre-link email, takesRounding. Delete only available when the Player has no Bills (otherwise disabled with tooltip "Has bills, cannot delete"; offer "Archive" if the product supports it, else omit).

### 2.6 Admin Settings `/admin/settings`

- **Transfer Destination (logged-in-only visibility)** in a `BattleWindow` with an admin-blue badge "Shown to signed-in Players only" (this explains the privacy model to the admin).
  - Fields: Bank name, Account holder, Account number (mono input), E-wallet name, E-wallet number (mono), QRIS image upload (optional, uses the same canvas/WebP pipeline, stored in R2 under a non-public key and served only through an authenticated Worker route), free-text note (<= 140 chars).
  - Each field optional; Home renders only configured ones.
  - **Preview:** live "What signed-in Players see" panel that uses the exact `TransferDestination` component from Home, fed with the form state. Clear label "Guests never see this".
  - Save is explicit (primary "Save destination"), with success toast; unsaved-changes indicator.
- Other settings placeholders (none required for v2). Keep the page intentionally short.
- Danger area (collapsed): "Sign out everywhere". Optional.

### 2.7 Admin navigation

- Admin chip in the top bar opens `/admin`. Inside `/admin/*` a **secondary nav row** (pill links) under the top bar: Collect, Bills, Players, Settings, with the active pill cream-filled. Nav items are links (`a`), keyboard navigable, 44px high on mobile, horizontally scrollable if needed.
- Bills list page (`/admin/bills`): dense list with merchant, date, status (draft, open, settled, archived), `BossHpBar size="sm"`, row actions (Edit, Copy public link, Archive). "New bill" primary button.

---

## 3. Neon implementation checklist and component boundaries

### 3.1 Ordered build sequence (Phase 5)

Work in this order. Each step ends with `just` checks (typecheck, lint, tests) passing. Verify each at **360px, 390px and 1280px**.

**Step 0, Prep (no UI yet)**

1. Move the `@theme` tokens, `.window`, `.num`, base focus styles into `src/styles.css` (section 1.1). Remove Variant A/B/C prototype CSS classes only after prototypes are archived (HANDOFF: archive on a throwaway branch).
2. Wire fonts (Chakra Petch, Plus Jakarta Sans, JetBrains Mono) with `swap`. Confirm `formatRupiah` from `@/domain/money` is the single source of Rupiah formatting (always output with the `.num` class).
3. Create `src/components/battle/` and write a small route-less `/dev/battle` gallery page (guarded to dev builds) showing every primitive in every state. Delete before production or gate on `import.meta.env.DEV`.

**Step 1, Shared primitives** (`src/components/battle/`)

`BattleWindow`, `WindowTitle`, `Avatar`, `MenuCursor`, `PrimaryButton`/`SecondaryButton`/`AdminButton`, `AmountText`, `KoStamp`, `BossHpBar` (+ tooltip + preview + `DamagePop`), `RoundUpChipBar`, `LockedNotice`, `StatusLine`, `Dialog` and `Drawer` (focus trap, Esc, scroll lock), `Lightbox`.
Acceptance: keyboard operable, reduced-motion verified, no inline hex colors, `BossHpBar` unit test for proportional widths, drained hatch, and aria values.

**Step 2, Shared composites**

`SplitList`, `BossCard`, `DefeatedRow`, `LeaderboardCard`, `TipRankProjection`, `TransferDestination`, `PayAllWindow` (composes chips, projection, actions, destination; props decide guest/linked/pending/all-clear state).
Acceptance: all four Pay-All states rendered from stories in the gallery with no data fetching inside the component.

**Step 3, Public screens**

1. App shell + top bar (guest sign-in, user badge, admin chip only for admin).
2. Home `/` (sections in priority order; wire server loader data; query-key the viewer's Player).
3. Public Bill Split `/b/$publicId` (lightbox, pay-all jump, totals reconciliation, 404).
4. Transfer Claim submit flow on Home (optimistic, `DamagePop`, pending state).

**Step 4, Admin screens**

1. `/admin` shell + secondary nav + route guard.
2. Collect desk (drawer on Home + `/admin` page), including custom amount and tip preview.
3. Admin Players (link/unlink, pre-link email, `takesRounding`).
4. Admin Settings (Transfer Destination form + live preview).
5. Bills list `/admin/bills`.
6. Bill Editor `/admin/bills/new` and `/admin/bills/$billId`: build in this order: items table, adjustments, allocation matrix, live Split preview, canvas crop/redaction, receipt upload + OCR polling, publish. Wire OCR last because it depends on Phase 4 endpoints.

**Step 5, Polish and QA**

Reduced-motion pass, contrast audit (section 1.6), keyboard-only walkthrough of each screen, screenshot review at 360/390/1280, remove prototype-only controls (role switcher, demo reset, Player picker for signed-in users).

### 3.2 Component boundaries

- **Presentational components** (`components/battle/*`) take plain props (numbers in integer rupiah, strings, callbacks). **No data fetching, no routing, no auth reads** inside them.
- **Feature components** (`features/home`, `features/bill`, `features/admin/*`) own data loading (TanStack Start loaders and server functions), mutations, optimistic state, and map domain data to presentational props.
- **Domain logic** (split math, rounding options, Tip Rank projection, totals) lives in `src/domain/*` as pure functions with tests. Components never reimplement money math; `getRoundUpOptions`, `projectTipRank` equivalents move from `prototypes/mock-data.ts` into `src/domain/tips.ts` with tests, then prototypes are archived.
- **Auth gating** is enforced twice: server (route middleware, API guards, never send Transfer Destination or admin data to unauthorized callers) and UI (do not render). UI hiding is never the only protection.
- **Money:** integers everywhere, `formatRupiah` only at render. Inputs accept digits, store integers.
- **Types:** one `BillView` view-model type shared by `BossCard`, `DefeatedRow`, public page, and desk (`chunks`, `remaining`, `total`, `paidCount`, `status`), derived in feature code, not in components.

### 3.3 Do and don't guardrails

**Do**

- Do keep **one cursor per window**, one hero number per screen, one gold primary CTA per window.
- Do express state with icon + pattern + text, never color alone.
- Do use `BattleWindow` for top-level groupings only (a window inside a window is a sunken row, not another window).
- Do keep body text >= 13px and hit targets >= 44px on mobile.
- Do show Rupiah in mono with tabular figures, right aligned in columns.
- Do keep copy in sentence case, domain vocabulary, no em-dashes, no middots.
- Do keep admin forms on plain inputs with standard behavior (focus, paste, autofill, keyboard Enter/Tab) inside the framed windows.
- Do default expandable details to **collapsed** on Home (scroll stays short) and **expanded** on the public Bill page (that page's whole job is the breakdown).
- Do handle loading with skeleton windows and errors inline, with retry.
- Do ensure Home still reads top to bottom without horizontal scroll at 360px (long merchant names truncate, account numbers wrap).

**Don't**

- Don't add all-caps eyebrows, tracked small caps, or decorative "LEVEL UP!" banners.
- Don't stack more than two animated things in view at once. No looping animations on admin screens except spinners.
- Don't nest windows (double-bevel inside double-bevel). Use sunken rows.
- Don't use pixel-font fills, scanlines, CRT effects, or noise overlays (hurts legibility and performance).
- Don't render Transfer Destination, Transfer Claim controls, or any hint of bank details to guests. Don't just `display: none` them.
- Don't render the Admin button or admin routes' links for non-admins.
- Don't put form inputs in the display font, don't style `select`/`input` as game buttons, and don't use hover-only affordances for anything required on touch.
- Don't use color-only HP states, and don't rely on tooltips as the only way to read a Split (the expanded list is the accessible source).
- Don't ship prototype-only things: role switcher, Player picker for signed-in users, demo reset, mock-data module, fake Tip quotes, or Lv and guild-title fields unless the data model gains them.
- Don't introduce new colors outside the token set. If a new semantic is needed, add a token and update this doc.
- Don't use the word "round-up", "overpay", "customer", or "order" as domain terms in copy (see section 0).
- Don't make the Bill editor feel like a game screen: no HP flash, no cursor bounce, no big shadows around every field.

### 3.4 Definition of done (per screen)

- Matches blueprint section in this doc, with deviations noted in the PR description.
- Passes typecheck, lint, domain tests, and has component tests for primitives and state variants.
- Screenshots at 360, 390, 1280 attached.
- Reduced-motion and keyboard-only passes done. Contrast pairs match section 1.6.
- No em-dashes or middots in copy or comments. All Rupiah figures use `.num`.
- Guest vs signed-in vs admin states verified, including that guest responses do not contain destination data.
