# Tabquest v2: Round 2 Prototype Briefs (for Neon)

Three new game worlds. None reuses the navy JRPG Battle Menu, the parchment Guild Board, or the white thick-outline Neo-Brutalist Arcade. All three keep what the user loved in `variant-e-opus.tsx`:

- **Proportional per-player HP chunks.** One bar per bill, each player owns a slice sized by `totalOwed / sum(totalOwed)`.
- **Damage preview.** Hovering or focusing the Pay/Notify button lights up YOUR chunks on every unpaid bill, then a floating `-RpX` damage number plays on a hit.
- **One scroll, strict vertical priority.**

Data and helpers come from `src/prototypes/mock-data.ts` (`getRoundUpOptions`, `projectTipRank`, `getTipLeaderboard`, `getSpendingLeaderboard`, `getBillRemainingAmount`, `getPlayerUnpaidTotal`, `TRANSFER_DESTINATION`). Props come from `VariantProps` in `variant-types.ts`. Do not change them.

## 0. Shared rules for all three prototypes

### 0.1 Vertical priority (identical in all three)

1. **TOP:** Bills to Pay. Order inside it: "How much I owe", round-up Tip chips, live Tip Rank jump, Copy digits, then Transfer Destination plus "Notify admin" (logged-in only; guests see a locked state), then Unpaid Bills with HP bars and inline expandable splits.
2. **MIDDLE:** Tip Rank ("Terima Kasih Orang Baik") and Spending Rank.
3. **BOTTOM:** Old / Settled Bills (`KO` or cleared), expandable inline.
4. **Admin Collect-All:** rendered only when `role === "admin"`. Do not mount it for other roles. It is not part of the scroll order. It opens from a single entry point.

Roles: `guest | player | admin`. Keep the Guest / Player / Admin switcher, player picker and Reset Demo in the top bar. They are demo chrome and must be visually quiet.

### 0.2 Chunk model (three states, not two)

Opus only had `alive` and `drained`. Notify only files a claim, so money has not arrived. Use three states per chunk:

| State | Rule | Meaning |
|---|---|---|
| `live` | `split.status === "unpaid"` and no claim for that player | Still owed |
| `pending` | `split.status === "unpaid"` and `player.pendingClaim !== null` | Player says they paid, waiting for admin |
| `drained` | `split.status === "paid"` | Admin confirmed |

Every concept below defines all three looks plus the YOUR variant of each. `pendingClaim` is per player (covers all their unpaid bills), so all of a player's live chunks flip to `pending` together on Notify.

Chunk width stays proportional to `totalOwed` forever. Drained chunks keep their width as a ghost slot. This keeps the "who owed what" shape readable after the hit.

### 0.3 Animation bugs found in `variant-e-opus.tsx` and the fixes (apply in all three)

| # | Bug | Where | Fix |
|---|---|---|---|
| 1 | **Strike preview sticks on forever after Notify.** The Notify button unmounts when `claim` is set, so `onMouseLeave` / `onBlur` never fire and `strike` stays `true`. Chunks flash permanently. | `YourTurn` button (lines ~477-495) plus `strike` state in `VariantEOpus` | Derive `previewing = (hover \|\| focusVisible) && !claim`. In the button handler call `setPreview(false)` before `onSubmitClaim`. Also clear in `useEffect(() => () => setPreview(false), [])`. Also reset when `activePlayerId` or `role` changes. |
| 2 | **Stripe animation is cancelled by the flash animation.** `.ve-mine` and `.ve-strike` both set the `animation` property on the same element, so the later one wins and the stripes stop during preview. | `KEYFRAMES` plus `BossHpBar` chunk classes | Never put two animation classes on one element. Use two layers: wrapper carries shake/flash, inner `.fill` carries stripes. Or combine with a comma list in one rule. |
| 3 | **Gradients cannot transition.** `transition-[background,filter]` does nothing between `linear-gradient` backgrounds, so alive to drained snaps with no drain. | `BossHpBar` | Render fills as stacked layers (`.live`, `.pending`, `.drained`) and cross-fade `opacity` or animate `transform: scaleX()` with `transform-origin: right`. Only animate `transform`, `opacity`, `filter`, `clip-path`. |
| 4 | **No drain ever plays.** Chunk widths never change and the status only flips on re-render, so nothing animates. The Notify click does not change the bar at all. | `YourTurn.notify` and `BossHpBar` | Add a `hit` event: `{ key, playerId, kind: "claim" \| "collect", perBill: [{ billId, amount }], tip }`. Chunks of that player read it and play the pending-lock or drain animation. Hold the event in a ref/state at the page root and pass it down. |
| 5 | **Damage number floats from the wrong place and shows the wrong amount.** It is anchored to the Pay-All window's top-right, not to the bars. It prints `chosen.amount` (split plus tip), but the damage to the bars is the split only. | `YourTurn` (lines ~321-330) | Spawn one `-RpX` per hit chunk, anchored to that chunk's center, showing that chunk's `totalOwed`. Tip goes in a separate `+RpT tip` number that flies toward the Tip Rank row. |
| 6 | **Floating numbers would be clipped.** The bar wrapper uses `overflow-hidden` for the rounded corners, so a number rendered inside it vanishes. | `BossHpBar` wrapper | Put the clipping on an inner `.track`. Render a sibling `.fx-layer` (`position:absolute; inset:0; overflow:visible; pointer-events:none`) for numbers and sparks. |
| 7 | **Admin Collect gives no visible hit.** The confirm happens in a full-screen drawer that covers the bars, and nothing plays when it closes. | `CollectDesk` / `onConfirmCollect` | On confirm, emit a `collect` hit. Keep the panel open, but also queue the animation so it plays on the bars when the panel closes or collapses (queue it with a 250 ms delay after close). Show a small `-RpX` in the panel row too. |
| 8 | **Tip Rank does not react.** Nothing on the Tip Rank board changes when a tip lands. | `Leaderboard` | On `collect` with `tip > 0`, FLIP-animate the row to its new rank (translateY from old index to new index, 450 ms, `cubic-bezier(.2,.9,.3,1.2)`), then pulse the YOU row once. |
| 9 | **No `prefers-reduced-motion` handling anywhere.** | whole file | See 0.4. |
| 10 | **Float keyframes reset on re-render.** `ve-float` is applied by a class that does not remount when the same amount repeats. | `hitKey` | Key every floater by `hit.key + chunkId`. Remove it on `animationend` (do not leave it at `opacity:0` in the DOM). |

Wiring sketch for Neon (adapt names to the variant):

```tsx
type Hit = {
  key: number
  playerId: string
  kind: "claim" | "collect"
  perBill: Array<{ billId: string; amount: number }>
  tip: number
}
const [hit, setHit] = useState<Hit | null>(null)
const [preview, setPreview] = useState(false)

// YourTurn
const onNotify = () => {
  setPreview(false) // fix 1
  setHit({ key: Date.now(), playerId: you.id, kind: "claim", tip: chosen.tip,
    perBill: you.unpaidBills.map(b => ({ billId: b.billId, amount: b.amount })) })
  onSubmitClaim(you.id, chosen.amount)
}
```

Use a `PreviewContext` (or props) so the bars never need the button handlers. Chunk class decision:

```tsx
const state = split.status === "paid" ? "drained"
  : players.find(p => p.id === split.playerId)?.pendingClaim ? "pending" : "live"
const isMine = split.playerId === youId
const isPreview = preview && isMine && state === "live"
```

### 0.4 Reduced motion (mandatory)

```css
@media (prefers-reduced-motion: reduce) {
  .fx-shake, .fx-flash, .fx-stripes, .fx-pulse, .fx-float, .fx-drain, .fx-stamp { animation: none !important; }
  * { transition-duration: 0.01ms !important; }
}
```

Rules when reduced motion is on:

- **Preview:** no motion. Show a static marker on your live chunks: a 2 px outline in the concept's alert color plus a small `-RpX` label fixed under the chunk.
- **Hit:** state change is instant. Floating numbers become a static label that stays 1.2 s with an opacity fade only, no translate. No shake, no flash, no FLIP. Rank change is announced via `aria-live="polite"` and a 1.2 s background highlight.
- Read the preference in JS too (`window.matchMedia("(prefers-reduced-motion: reduce)")`) before adding any WAAPI or JS-driven tween.

### 0.5 Accessibility floor

- Each bar is `role="meter"` with `aria-valuenow` (remaining), `aria-valuemax` (total), and a label with the merchant. Each chunk has a `title` plus a visually hidden `<span>` ("Bima, Rp31.800, unpaid").
- Do not rely on color alone. Live, pending, and drained differ by pattern and shape too.
- Visible `:focus-visible` ring on every button, in the concept's accent.
- Contrast: body text on its surface at least 4.5:1.
- Touch targets at least 44 px tall. Layout works at 360 px width.
- Dates use the same `fmtDate` helper as Opus. Currency uses `formatRupiah`.

### 0.6 Shared copy rules

Plain verbs, sentence case. No ALL-CAPS labels. Buttons say what happens: "I've transferred Rp50.000, notify admin". Guest lock message: "Sign in to see where to transfer and notify admin". Do not use em-dashes anywhere in UI copy.

---

## Prototype 1: "Inkwell Playroom" (variant-f)

### 1. Name, game world, layout

**World:** a cozy, Splatoon-meets-Nintendo-paper-toy playroom. Everything is a layered paper cutout with soft drop shadows and glossy ink. Bills are **ink tanks**: clear tubes filled with colored ink, one ink color per player.

**Layout structure: "stacked pop-up cards on a sky-paper desk".** Single centered column (max 640 px). Cards are slightly rotated (alternating -0.6deg / +0.5deg, only at rest; straighten on hover/focus and under reduced motion). Section headers are sticker tabs that stick out of the card's top-left edge. It is the only concept with a **podium** for ranks and a **sticker book** grid for old bills.

```
+------------------------------------------------+
| (logo sticker)        [Guest|Player|Admin] [R] |   top bar: floating paper ribbon
+------------------------------------------------+
| pick player: (o)(o)(o)(o)(o)                   |
|  .-------------------------------------------. |
| [Your turn] sticker                            |  <- 1. pay card, tallest, magenta shadow
|   You owe  Rp 94.400   (huge)                  |
|   (Exact)(Round 5k)(Round 10k)(Clean 100k)     |
|   Tip rank  #4  ->  #3 (passes Nadya)          |
|   [Copy 100000]  [Notify admin]                |
|   Transfer: BCA 5480-912-388                   |
|  '-------------------------------------------' |
| [Ink tanks] sticker                            |
|  Kopi Tuku  =====(ink)(ink)[you](drained)===   |  tubes with proportional chunks
|  tap to open splits                            |
|                                                |
| [Podium] 3 paper columns: Tip rank             |  <- 2. podium, then spending as sliding list
|  [Spending rank list with ink-bar rows]        |
|                                                |
| [Sticker book] 2-col grid of KO stickers       |  <- 3. old bills
+------------------------------------------------+
| (admin only) pull-up tab "Backstage" at bottom |  <- 4. bottom sheet
```

### 2. Palette and typography

| Name | Hex | Use |
|---|---|---|
| Sky Paper | `#E6F0FF` | page background |
| Card White | `#FFFFFF` | card faces (with a 1 px `#C9D8F5` edge) |
| Deep Indigo Ink | `#1E1B6B` | text, outlines on tank glass |
| Splat Magenta | `#FF2D8A` | YOUR ink, primary buttons, alerts |
| Lime Pop | `#B4F000` | paid, drained-ghost accent, success, tip |
| Sunny Yolk | `#FFC933` | pending (reported) state, tip chips selected |
| Tank Cyan | `#27C8E8` | other players' ink (see rotation below) |

Other players' inks rotate through `#27C8E8`, `#8B5CF6`, `#FF8A3D`, `#2EC4A0`, `#F25F8A` by player index. Your chunk is always Splat Magenta so it stays unmistakable. Never put a rotation color adjacent to a same-hue neighbor: cycle by index, skipping any color equal to the left neighbor.

**Type:** `Bricolage Grotesque` (700 to 800, `font-variation-settings: "wdth" 85` for headlines and big numbers) plus `Plus Jakarta Sans` for body. Use `JetBrains Mono` only for the Copy digits chip and account number. **No new Google Font imports.** Section stickers use Bricolage 800 at 15 px, sentence case, a slight rotation (-2deg).

### 3. Signature HP bar: the ink tank

**Shape:** a horizontal glass tube, 28 px tall (open) or 14 px (settled), `border-radius: 999px`, 3 px Deep Indigo outline, white inner glass with a faint top gloss line (`linear-gradient(to bottom, rgba(255,255,255,.7) 0 30%, transparent 30%)` overlay). Chunks sit inside as ink columns separated by 3 px **bubble gaps** (white gaps with an indigo 1 px hairline, like a segmented tube).

**Chunk looks:**

- **live (others):** solid ink in that player's rotation color, plus a lighter 35% highlight stripe along the top, plus a tiny wavy meniscus (clip-path wave) on top edge.
- **live (YOU):** Splat Magenta, with white diagonal sheen bands scrolling slowly (`background-size: 24px 100%`, 1.4 s linear, on the inner `.fill` only, per fix 2). A small white "YOU" tag pin hangs under the tube.
- **pending:** ink stays but desaturates to Sunny Yolk with a dotted indigo overlay (`radial-gradient(circle, rgba(30,27,107,.35) 1.5px, transparent 1.6px) 0 0/8px 8px`). A tiny hourglass icon sits at chunk center when width is at least 36 px.
- **drained:** ink gone. A pale glass slot with a Lime Pop dot-outline and a lime check at center (if width at least 28 px). Slot keeps its width.

**Hover / focus damage preview** (on Notify and Copy hover or `:focus-visible`, only when `!claim`):

1. YOUR chunks on all unpaid bills do a **"slosh"**: `transform: translateY(0) -> translateY(-2px) -> 0` combined with `scaleY(1) -> 1.08 -> 1` on the `.fill` layer, 700 ms ease-in-out infinite (this is the wrapper layer; stripes are on the inner layer so they do not collide).
2. A magenta ring pulses around each chunk: `box-shadow: 0 0 0 0 rgba(255,45,138,.55) -> 0 0 0 6px rgba(255,45,138,0)`, 900 ms infinite.
3. A static ghost label appears under each of your chunks: `-Rp31.800` in Bricolage 800 14 px, Splat Magenta on a white pill, so the cost reads even without motion.
4. Other chunks dim to 55% opacity (`filter: saturate(.6)`) so yours stand out. 160 ms transition.

**Hit (Notify, `kind: "claim"`):** each of your live chunks cross-fades from magenta to yolk-dotted `pending` in 360 ms (opacity cross-fade between layers, fix 3). Per chunk, a `-RpX` floater (owed for that bill, fix 5) pops: `translateY(6px) scale(.8) -> translateY(-14px) scale(1.15) -> translateY(-40px) scale(1)`, opacity `0 -> 1 -> 0`, 1 s, with a 90 ms stagger by bill order. Floater is Bricolage 800, Splat Magenta with a 3 px white text-stroke (`paint-order: stroke fill`). Small ink droplets (4 absolutely placed 6 px circles) fly outward 16 px and fade over 500 ms.

**Settle (Admin confirm, `kind: "collect"`):** the player's pending chunks **drain**: the `.fill` layer animates `transform: scaleX(1) -> scaleX(0)` with `transform-origin: right`, 600 ms ease-in, while three drips (`border-radius: 0 0 50% 50%` ink-colored 6 px blobs) fall 18 px below the tube and fade. Lime Pop `-RpX` floaters. When the last unpaid chunk of a bill drains, the whole tube flashes lime for 240 ms, then a **KO sticker** (rounded rect, Lime Pop, indigo text "Paid up!", rotation -8deg) slaps on: `scale(2.2) rotate(-24deg) opacity 0 -> scale(1) rotate(-8deg) opacity 1`, 320 ms `cubic-bezier(.2,1.4,.4,1)` with a 40 ms screen-wide nudge on the card (`translateY(2px)`). The card then collapses into the sticker book after 900 ms (height tween 280 ms).

**Tip Rank climb pulse:** the YOU chip on the podium or list FLIPs to its new place (fix 8), and a Lime Pop `+RpT tip` floater flies from the Notify area to the YOU row over 700 ms (`offset-path` is not required; just translate). The YOU row pulses `scale(1) -> 1.06 -> 1` once, 360 ms.

### 4. Component and layout details

- **Top bar:** floating white paper ribbon, 56 px, `box-shadow: 0 4px 0 #C9D8F5`. Logo: a "T" sticker in magenta, wordmark `Tabquest` in Bricolage 800. Right: role segmented control (3 stickers, selected one is magenta with white text), reset icon button. Sticky.
- **Your turn / Pay-All card:** the biggest card, with a magenta paper shadow underneath (a second card offset 6 px, `#FF2D8A` at 25%). "You owe" label small; amount at `clamp(44px, 12vw, 64px)` Bricolage 800 width 85, Deep Indigo. Tip chips are rounded square "tokens" (not pills) with a punched hole; selected chip is Sunny Yolk with a 2 px indigo outline and a 2 px lift. Live Tip Rank line: a lime badge `#4 -> #3` with an up-arrow, and copy "passes Nadya" or "Rp3.400 more passes Dewi". **Copy digits:** chip in JetBrains Mono, `Copy 100000`, check animation (scale pop) on copy. **Guest locked state:** the transfer and notify area becomes a dashed indigo box with a padlock and the exact guest message, 1 px diagonal hatch fill. No bank details in the DOM for guests. **Logged-in:** a white "ticket" with a perforated left edge showing BCA name, account number (mono), and e-wallet/QRIS line; Notify button is a Splat Magenta pill with a thick bottom edge (`0 4px 0 #A5115A`). After notify, the button turns into a Sunny Yolk "Reported Rp100.000, waiting for admin" state.
- **Active unpaid bills (ink tanks):** each bill is a card with merchant, date, `n of N paid`, the tube, then `Rp remaining / Rp total` and an "open splits" caret. Cards you owe on sort first and have a magenta left tab. Expanded splits are inline: a list of paper "receipt slips" per player (zigzag bottom edge), YOU slip highlighted with a magenta underline, showing items, voucher, fees, paid and tip.
- **Tip and Spending Ranks:** **Tip Rank "Terima Kasih Orang Baik"** is a **podium**: three paper columns (heights 100%, 78%, 64%) for the top 3 with avatar discs on top and a crown on the first, and ranks 4+ as a compact list beneath. Include the monthly pot and the best-tip quote card in a speech bubble. **Spending Rank** is a vertical list with ink-bar rows (bar width proportional to `monthlySpend / max`), YOU row outlined in magenta.
- **Old bills (sticker book):** 2-column grid on at least 480 px, 1 column below. Each is a small sticker card with a rotated Lime `KO` stamp, merchant, date, total, `+Rp tips`, and a flat 10 px tube. Tapping expands the card to full width inline (grid-column span 2) and shows the same slips.
- **Admin Collect-All:** only when `role === "admin"`. A bottom-anchored pull-up tab labelled "Backstage" with a pending-claims count bubble, always visible while admin. Tapping slides a bottom sheet up to 85vh (`translateY(100%) -> 0`, 280 ms). Content: outstanding total headline, rows per debtor with claim amount, `+tip` in lime, "Confirm Rp100.000" (primary) and "Got exact Rp94.400" (secondary). Confirm triggers the settle animation on the bars; collapse the sheet to 30vh for 1 s so the user sees the drain, then restore.

### 5. Prototype 1 risk notes

Keep the rotation of cards to at most 0.6deg and disable it for the card the user is interacting with. Do not use heavy blur. Shadows are hard-offset paper shadows only.

---

## Prototype 2: "Raid Telemetry" (variant-g)

### 1. Name, game world, layout

**World:** a tactical mecha raid console in a daylight hangar. Warm alabaster panels, gunmetal ink, signal orange for hostiles. Not neon-on-black. Bills are **targets**, chunks are **armor plates**, the Pay-All card is the **weapons-free panel**.

**Layout structure: "two-rail cockpit with a metric ruler".** A 12-column grid on desktop: a 3-column left **telemetry rail** (sticky, holds the "You owe" number and Tip Rank prediction) and a 9-column main column of targets. On mobile the rail collapses to a full-width top strip, then targets below. Targets are **dense rows with a scale ruler** (tick marks every 10 percent above the bar), not cards. Ranks are **side-by-side data columns** with delta arrows and sparkline-like bars. Old bills are a **mission log table**.

```
+---------------------------------------------------------------+
| TABQUEST  ::  link: LIVE   [role]            [player] [reset] |  slim gunmetal strip
+--------------+------------------------------------------------+
| OWE          | TARGETS (3 live)                               |
| Rp 94.400    | Kopi Tuku  |0%--20--40--60--80--100|           |
| ------------ | [###][###][YOU][ // ]  Rp46.200 / Rp131.000    |
| tips: chips  | > splits                                       |
| rank #4->#3  |                                                |
| [copy][ntfy] | Bakmi GM   ...                                 |
| transfer     |                                                |
+--------------+------------------------------------------------+
| TIP RANK (Terima Kasih Orang Baik) | SPENDING RANK             |  two columns, mono tables
+---------------------------------------------------------------+
| MISSION LOG: settled (KO)  row  row  row                       |
+---------------------------------------------------------------+
| (admin) right drawer "Command" 420 px                           |
```

On mobile the order is rail, targets, ranks, log (still 1-2-3).

### 2. Palette and typography

| Name | Hex | Use |
|---|---|---|
| Alabaster | `#ECE8DF` | page background |
| Panel Ivory | `#F7F4EC` | panels, rail |
| Gunmetal | `#2B2F36` | text, bar outlines, top strip |
| Signal Orange | `#FF5B1F` | YOUR plates, primary action, alerts |
| Radar Teal | `#0F9D95` | paid, drained trace, tip positive |
| Hazard Amber | `#E9B100` | pending / awaiting admin, caution stripes |
| Steel | `#8A919B` | secondary text, ticks, other players' plates |

Other players' plates: Gunmetal at 78%, 62%, 48%, 36% alternating by index to give a tonal "armor panel" feel (no rainbow). YOU is the only orange on the bar.

**Type:** `Big Shoulders Display` (700 to 800) for the big "You owe" number, section titles and the Notify button; `JetBrains Mono` for every rupiah and tick label; `Plus Jakarta Sans` for body copy. **New import required (one font only):**

```html
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&display=swap" rel="stylesheet">
```

(or `@import url("https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&display=swap");` inside the variant's style block). Use sentence-case labels, not all caps.

### 3. Signature HP bar: segmented armor plating

**Shape:** a 26 px tall track (14 px compact) with square-ish 3 px corners, a 2 px Gunmetal outline, and a **scale ruler** above it: 11 tick marks (0 to 100%) in Steel, 6 px tall, with `0` and `100` in mono 10 px. Chunks are armor plates separated by 2 px gaps with small corner bevels (via `clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))` on plates at least 28 px wide; narrower plates stay rectangular).

**Chunk looks:**

- **live (others):** tonal Gunmetal plate with a 1 px inner highlight and 4 small rivet dots (only if wide enough, at least 40 px).
- **live (YOU):** Signal Orange plate with Hazard Amber caution stripes at 45 degrees (`repeating-linear-gradient(45deg, rgba(0,0,0,.18) 0 6px, transparent 6px 12px)`), stripes scroll slowly on the inner `.fill` only (fix 2). A small orange chevron marker above the ruler points down at the plate: the "target lock bracket".
- **pending:** Hazard Amber plate with a dashed Gunmetal inner border and a slow 2 s opacity blink between 100% and 78% (blink disabled under reduced motion; replaced by solid fill plus a clock glyph).
- **drained:** plate removed. A Radar Teal 2 px **trace line** (a flat line along the bottom of the slot, like a flatlined ECG) plus faint 8% hatch. Keeps width.

**Hover / focus damage preview** (Notify hover or focus, when `!claim`):

1. A **targeting reticle** appears on each of YOUR plates: four 8 px corner brackets in Signal Orange that start 10 px outside the plate and **snap in** to the plate edge (`translate` 10px to 0 over 140 ms, `steps(3, end)`).
2. The plate itself does a hard 2-frame **flicker**: `opacity 1 -> .55 -> 1 -> .55 -> 1` over 420 ms, repeating every 900 ms (applied to a wrapper, not the stripe layer).
3. A **crack preview**: a thin zigzag SVG crack path (2 px dark line) is drawn with `stroke-dashoffset` from full to 0 over 360 ms across each plate at least 36 px wide. It stays drawn during the preview.
4. Static label `-Rp46.200` in JetBrains Mono 12 px sits on a Gunmetal flag below the plate (always visible during preview, including reduced motion).
5. The sticky "Owe" number in the rail shows a thin orange underline sweeping left to right once (240 ms) to connect the button to the cost.

**Hit (Notify, `kind: "claim"`):** reticle locks (brackets pulse once to 1.2 scale and back, 160 ms), plates go through a 3-frame **shock**: `translateX(-2px) -> 2px -> -1px -> 0`, 220 ms, then cross-fade to `pending` Hazard Amber over 240 ms. Each hit plate spawns a `-RpX` readout that **types in** with a 12 ms per character stepped reveal, then drifts up 24 px while fading (900 ms). Floater is JetBrains Mono 700 15 px, Signal Orange on a Gunmetal chip.

**Settle (Admin confirm, `kind: "collect"`):** the plate **shatters**: split the plate into 3 clip-path shards (simple `clip-path: polygon` triangles via three stacked copies) that translate outward 10 to 20 px with `rotate` of up to 18 degrees and fade over 480 ms, leaving the Teal trace line which draws left to right over 300 ms. When a whole bill reaches zero HP: a **KO sweep** (a Radar Teal scan line passes across the target row top to bottom in 420 ms, `clip-path` reveal), the row title gets a `NEUTRALIZED` stamp in sentence-case form "Cleared" (Big Shoulders 800, Teal, border 2 px, rotate -3deg, scale 1.6 to 1 over 200 ms), then the row slides into the mission log (height tween 260 ms).

**Tip Rank climb pulse:** the rank row moves via FLIP (450 ms). A Teal `+RpT` readout rides up the rank column, and a **delta chip** next to YOU shows `▲ 1` in Teal that holds for 3 s then fades. The row background flashes Radar Teal at 18% for 600 ms once.

### 4. Component and layout details

- **Top bar:** slim 44 px Gunmetal strip, Panel Ivory text. Left: wordmark in Big Shoulders 800, a link indicator ("Live" with a small teal dot, static). Right: role toggle (three segments, active = Ivory fill, Gunmetal text), player select (native `<select>` styled, for density), reset icon.
- **Your turn / Pay-All (telemetry rail):** on desktop, a sticky rail card (`position: sticky; top: 56px`). Contents top to bottom: label "You owe", number in Big Shoulders 800 at 56 to 72 px with a mono subline `n targets`; tip chips as a vertical stack of **toggle rows** (radio style) each showing label, total, and `+tip` in Teal; Live Tip Rank block: two mono lines `Rank #4 -> #3` and `passes Nadya`; Copy button full width (`Copy 100000`); then Transfer Destination panel (logged-in): a **keyed tag** with BCA, holder, account (mono 15 px, copy-on-click), e-wallet; then the Notify button in Signal Orange with a Gunmetal bottom edge `0 4px 0 #8A2A07` and the label "I've transferred Rp100.000, notify admin". **Guest locked state:** the Transfer panel is replaced by a gray **locked bay** with a padlock icon, hatch fill and the exact guest line; the Notify button is absent. After notify: Amber block "Reported Rp100.000, waiting for admin".
- **Active unpaid bills (targets):** each row: merchant, date, `n of N paid`, **ruler**, bar, then mono line `Rp remaining / Rp total` and a `Splits` toggle. Rows where you owe get an orange 4 px left bar. Expanded splits slide down inline (grid-template-rows `0fr -> 1fr`, 220 ms) as a **mono table**: player, items, voucher, fee, owed, status chip. YOU row has an orange left rule.
- **Tip and Spending Ranks:** two equal columns (stack on mobile). Each is a **mono table** with rank, avatar initials square, name, amount, and a thin proportional bar behind the row (8% fill). Tip Rank gets header "Terima Kasih Orang Baik", a pot subline, and a best-tip note card. Delta chips show last change. YOU row has an orange left rule and bold weight.
- **Old bills (mission log):** table-like rows, 40 px each: `Cleared` stamp cell, merchant, date, party size, `+tips` in Teal, total, caret. The compact bar (10 px, all Teal traces) sits under the row. Expanded: same splits table inline.
- **Admin Collect-All:** only when `role === "admin"`. A button "Command" in the top strip with the pending count badge (Signal Orange). It opens a **right-side drawer** 420 px wide (full width below 640 px), `translateX(100%) -> 0` over 240 ms, scrim at 30% (so bars stay visible on desktop; do not fully cover them). Content: total outstanding in Big Shoulders 800, rows per debtor with claim amount, `+tip`, Confirm and Exact buttons. On confirm the row greys and shows a Teal check; the matching plates shatter behind the scrim in real time (fix 7). Drawer stays open for multiple confirms.

### 5. Prototype 2 risk notes

The reticle and shards must not shift layout: use `position: absolute` inside the `.fx-layer`. The mono type is for data only. Do not overuse caps and tracking.

---

## Prototype 3: "Pocket Moss" (variant-h)

### 1. Name, game world, layout

**World:** a handheld pixel cartridge console (Game Boy meets Playdate), but in a muted moss and grey-shell palette, not the cliché 4-green LCD. The whole app lives **inside a handheld shell**: a chunky body, a "screen" bezel, and the page scrolls **inside the LCD**. Bills are **bosses on a 1-bit-dither battlefield**, chunks are **pixel blocks**.

**Layout structure: "device shell with LCD viewport".** The page background is a desk. A centered **console body** (max 520 px) with rounded corners, a top speaker-grille strip, and a bezel around the screen. Scrolling happens with the **page** (not an inner scroller, to keep native scroll and keyboard behavior): the shell is tall, with the bezel header sticky at the top. Each section is a **level screen** with a title bar in sentence case. Ranks use the **arcade high-score list** with 3-letter initials. Old bills are **save slots**.

```
        desk (dithered)
   +==========================================+
   | ::::: speaker grille       [PWR] [role]  |  shell top
   |  .------------------------------------.  |
   |  | TABQUEST          (screen bezel)   |  |
   |  | +--------------------------------+ |  |
   |  | | OWE  Rp 94.400   (pixel font)  | |  |  <- 1
   |  | | [Exact][5k][10k][100k]         | |  |
   |  | | RANK #4 > #3                   | |  |
   |  | | [Copy] [Notify admin]          | |  |
   |  | | BOSS: Kopi Tuku  [#][#][YOU][.]| |  |
   |  | |------------------------------- | |  |
   |  | | HIGH SCORES (tip) / (spend)    | |  |  <- 2
   |  | |------------------------------- | |  |
   |  | | SAVE SLOTS (cleared)           | |  |  <- 3
   |  | +--------------------------------+ |  |
   |  '------------------------------------'  |
   |      (+)   (select)(start)    (B) (A)    |  shell bottom: decorative d-pad, start opens Admin if admin
   +==========================================+
```

On screens narrower than 520 px the shell goes full-bleed (no desk), keeping the bezel top and a slim footer.

### 2. Palette and typography

| Name | Hex | Use |
|---|---|---|
| Shell Grey | `#CFCBBF` | console body, desk accents |
| LCD Light | `#D8E4B8` | screen background |
| LCD Mid | `#8FAE6E` | other players' chunks, dividers |
| LCD Dark | `#3E5B3B` | text, YOUR chunk base, outlines |
| LCD Ink | `#1B2A20` | deepest shade, thick outlines, text on mid |
| Hit Red | `#E8473C` | the only hot color: damage numbers, YOUR preview, KO |

Pending uses a dither of LCD Dark over LCD Light (checker pattern), not a new color. Drained uses an empty slot with a 1 px LCD Dark dotted outline. This keeps the palette strict (6 colors).

**Type:** `Pixelify Sans` (400 to 700) for headings, buttons, labels; `JetBrains Mono` for every rupiah (tabular) so digits are readable; `Plus Jakarta Sans` for the longer split item lines (small copy readability). **New import required:**

```html
<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&display=swap" rel="stylesheet">
```

(or the equivalent `@import`). Use `image-rendering: pixelated` for any generated sprites. `-webkit-font-smoothing: none` is optional on headings only. Do not use ALL CAPS for labels; Pixelify reads fine in sentence case.

### 3. Signature HP bar: pixel block gauge

**Shape:** a 24 px tall (12 px compact) rectangle, **no border-radius**, 3 px LCD Ink outline plus a 3 px offset hard shadow (`box-shadow: 3px 3px 0 #1B2A20`). Chunks are separated by 3 px LCD Ink dividers. Corners are "notched" 3 px squares via `clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px)` on the track. The inside has a faint 2 px pixel grid overlay (`background-size: 4px 4px`).

**Chunk looks:**

- **live (others):** LCD Mid with a pixel highlight row on top (2 px lighter row `#B5CC94`).
- **live (YOU):** LCD Dark with a 45-degree dither stripe in LCD Mid (stepped via `repeating-linear-gradient` with hard 4 px bands) that **advances in steps** (`animation: steps(4) 0.6s infinite`) on the inner `.fill`; a small pixel arrow sprite (CSS box-shadow pixel art, 7x7) bobs 2 px above the chunk. Under reduced motion the arrow is static.
- **pending:** checkerboard dither (LCD Dark on LCD Light, 2 px cells) with a pixel hourglass glyph for chunks at least 30 px wide.
- **drained:** hollow slot: LCD Light fill with a 1 px dotted LCD Dark inner outline and, if wide enough, a pixel check glyph. Keeps width.

**Hover / focus damage preview** (Notify hover or focus, when `!claim`), everything uses **stepped timing** to feel 8-bit:

1. YOUR chunks **blink** between normal and Hit Red using `steps(1)`: `0-50% normal, 50-100% Hit Red`, 500 ms infinite (wrapper layer; the stripe layer is separate per fix 2).
2. The chunk gets a 3 px Hit Red outline and shakes 2 px with `steps(2)`: `translateX(-2px) / translateX(2px)`, 160 ms infinite.
3. A static `-31.800` style label (mono 12 px, Hit Red on LCD Light, 2 px LCD Ink outline) sits above each chunk, always visible during preview.
4. Other chunks stay as they are (do not dim; the blink is contrast enough on a 4-shade screen).
5. The Notify button shows a pixel "A" glyph that depresses 2 px.

**Hit (Notify, `kind: "claim"`):** a **screen flash**: a 120 ms LCD Light overlay on the whole boss card (`steps(2)`), then the chunk **dissolves into the pending dither** over 4 stepped frames (opacity steps 100, 75, 50, 100 through a dither mask; implement by swapping the layer with `steps(4)` on opacity). Each hit chunk emits a `-RpX` floater: rises 6 px per frame in four steps (`steps(4)` over 700 ms), mono 700 14 px, Hit Red with a 2 px LCD Ink outline (use `text-shadow` in 4 directions). A 3-frame "hit spark" (a pixel star drawn as a 5x5 box-shadow sprite) appears at the chunk edge.

**Settle (Admin confirm, `kind: "collect"`):** the pending chunk **crumbles**: the chunk is split into a 4x2 grid of square pixel blocks (CSS grid of 8 `span`s) which each fall 12 to 24 px with different delays (0 to 180 ms) and fade with `steps(3)` over 520 ms; the slot ends hollow. When a bill reaches zero HP: boss card does a 4-step **blink** (visible, hidden, visible, hidden, visible, 80 ms each), then a big pixel **KO** stamp in Pixelify 700 (Hit Red, 2 px LCD Ink outline) drops in from 24 px above with `steps(4)` and a 2 px screen bump. Then the card collapses to a save slot (height tween 240 ms, `steps` not required).

**Tip Rank climb pulse:** the high-score list reorders using FLIP but with `steps(6)` timing over 480 ms (rows jump in pixel increments). The YOU row blinks its initials (`AAA` style initials like `BMA`) 3 times, 120 ms each, and a `+RpT` Hit Red-free floater uses LCD Dark (tip is good news, but the palette has no green; use LCD Dark with a "+" sprite and a small up arrow glyph). A 1-line toast in the log bar reads "Rank up: #4 to #3".

### 4. Component and layout details

- **Top bar:** shell-top strip with decorative speaker grille (repeating 2 px slots) and a small "PWR" LED (LCD Mid dot, static). The role switcher is three small hardware-style slide switches rendered as a segmented control (Guest / Player / Admin, labels in Pixelify 600 12 px). The screen's bezel header (sticky) shows "Tabquest" in Pixelify 700 18 px and the Reset button as a pixel "reset" icon. The player picker is a horizontally scrollable row of 28 px initials tiles.
- **Your turn / Pay-All:** a "screen" panel with a 3 px LCD Ink border. "You owe" label (Pixelify 400 14 px); amount in JetBrains Mono 700 at `clamp(36px, 11vw, 52px)` on LCD Dark with a 3 px offset pixel shadow in LCD Mid. Tip chips are square 40 px-tall buttons with a 3 px LCD Ink outline, selected = LCD Dark fill with LCD Light text and a ">" cursor sprite before the label. Live Tip Rank line: `RANK #4 > #3` form written as "Tip rank #4 to #3, passes Nadya" in sentence case with a pixel up-arrow. **Copy digits:** square button `Copy 100000` with a pixel check on success. **Guest locked state:** a dithered locked box with a pixel padlock and the exact guest message; no bank details in DOM. **Logged-in Transfer Destination:** a "link cable" card: BCA, holder, account (mono 15 px), e-wallet/QRIS; **Notify admin** is a wide button with a 4 px hard shadow, label "I've transferred Rp100.000, notify admin"; after reporting it becomes a dither "Reported Rp100.000, waiting for admin" box.
- **Active unpaid bills (boss fights):** each boss is a bordered panel with a pixel skull sprite (8x8 box-shadow art, or a Phosphor `Skull` icon with `shape-rendering: crispEdges` as a fallback), merchant (Pixelify 700 16 px), date, `n of N paid`, gauge, and mono remaining `Rp remaining / Rp total`. Bills you owe on sort first, with a "Your bill" tag in a LCD Ink label. Expanded splits are a **inventory list**: each player a 1-row panel with 2 px LCD Ink bottom border, items in small Plus Jakarta Sans 13 px, mono amounts; YOU row has a pixel cursor sprite.
- **Tip and Spending Ranks (high scores):** two stacked lists inside one "HIGH SCORES" panel (sentence case: "High scores") (no tabs: both lists stay visible, one after the other, to respect "MIDDLE: both ranks"). Each list: rank number, 3-letter initials from `avatar`, name, dotted leader (`border-bottom: 2px dotted`) to the amount in mono. The top row has a pixel crown sprite. Tip Rank has the heading "Terima Kasih Orang Baik" and a best-tip quote in a speech box with a pixel tail.
- **Old bills (save slots):** a list of slot rows: "Slot 1", merchant, date, total, a tiny 10 px gauge (all hollow), and a stamped `KO` badge (Hit Red, 2 px outline, rotated 0deg, pixel-sharp). Tap to expand inline to show splits. The label "Cleared" for the section.
- **Admin Collect-All:** only when `role === "admin"`. The shell's decorative "Start" button is live only for admin and is labeled "Collect" with a count badge; it opens a **menu overlay inside the screen** (not a full-screen drawer): an LCD Light panel with LCD Ink border sliding down from the screen top (`translateY(-100%) -> 0`, `steps(5)` 260 ms, instant under reduced motion). Rows per debtor with claim amount, `+tip`, "Confirm Rp100.000" and "Got exact Rp94.400" buttons. The overlay uses an LCD Ink 60% scrim at the screen level so the gauges below remain partly visible. After Confirm the matching chunks crumble in sync (fix 7).

### 5. Prototype 3 risk notes

Pixel fonts at small sizes hurt legibility: never go below 13 px for Pixelify, and put all long text in Plus Jakarta Sans. Test contrast of LCD Mid text on LCD Light (it fails): never use LCD Mid for text, only LCD Dark and LCD Ink. Keep the decorative d-pad and A/B buttons `aria-hidden` and non-interactive.

---

## Structural contrast cheat sheet

| Axis | 1 Inkwell Playroom | 2 Raid Telemetry | 3 Pocket Moss |
|---|---|---|---|
| Container | Centered stack of tilted paper cards | 12-col grid with sticky left rail | Handheld device shell and LCD |
| Pay-All position | Hero card at top | Sticky rail beside targets | Screen panel inside shell |
| Bar metaphor | Ink tank tube (glass, rounded) | Armor plates with ruler (bevelled) | Pixel block gauge (notched, stepped) |
| Preview | Slosh and magenta ring pulse | Reticle snap, flicker, crack draw | Red blink and 2 px shake, stepped |
| Settle | Drain scaleX plus drips, lime KO sticker | Shatter shards, teal trace, scan line | Crumble blocks, blink, pixel KO drop |
| Tip Rank form | Podium plus list | Mono table with delta chips | High-score list with initials |
| Old bills | Sticker book grid | Mission log table | Save slots |
| Admin | Bottom pull-up sheet | Right drawer, partial scrim | In-screen menu overlay |
| Motion feel | Squishy, springy | Snappy, mechanical | Stepped, 8-bit |

## Deliverables for Neon

- Files: `src/prototypes/variant-f-inkwell.tsx`, `variant-g-telemetry.tsx`, `variant-h-pocket.tsx`. Each exports a component taking `VariantProps` and does not edit `mock-data.ts` or `variant-types.ts`. Register them wherever the existing variants register.
- Each file includes its own `KEYFRAMES` string, a `prefers-reduced-motion` block, and the three-state chunk model from 0.2.
- Each applies all ten fixes from 0.3. Add a short comment `// fix N` at each fix so the user can see them.
- Hit and preview behavior must be demonstrable without reloading: Notify then (as Admin) Confirm, then Reset Demo.
- Run the project's existing lint/typecheck recipes from the `justfile` before handing back.
