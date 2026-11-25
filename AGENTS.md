# Tabquest v2 Engineering Rules

## Cloudflare D1 Read/Write Budget & Query Rules

Every new feature, service, or migration MUST follow these rules so D1 stays fast and well inside the $0 free tier (5M rows read/day, 100k rows written/day):

1. **No interactive `db.transaction()`:** Cloudflare D1 does not support `db.transaction(async (tx) => ...)`. Read and validate first, compute deterministic writes in pure TypeScript, then commit atomically with `db.batch([...])`.
2. **No N+1 queries:** Never `await db.*` inside a loop (`for`, `.map()`, `Promise.all()`). Use SQL `JOIN`s, `inArray` (chunked via `chunkForD1`), or a single `db.batch([...])`.
3. **Batch multi-query reads:** When a route loader or API endpoint needs more than one independent `SELECT`, wrap them in a single `await db.batch([q1, q2, ...])` so the Worker pays 1 D1 round-trip instead of N.
4. **Use the `bill_players` split snapshot for summaries:** `bill_players` stores `item_subtotal`, `adjustment_total`, and `share_amount` (computed once on save/publish via `computeSplit()`). List, Home, Ranks, Tip Wall, Player Insights, and Admin Collect All queries MUST read from `bills + bill_players + payment_statuses` and MUST NOT scan `items`, `item_allocations`, `adjustments`, or `adjustment_allocations`. Only single-bill detail (`/b/$publicId`) and admin bill editing may read itemized allocation tables.
5. **Always hit partial indexes for active state:**
   - Unpaid queries MUST filter `payment_statuses.status = 'unpaid'` (uses `payment_statuses_unpaid_idx`).
   - Pending transfer claim queries MUST filter `transfer_claims.status = 'pending'` (uses `transfer_claims_pending_idx`).
   - Public bill feeds MUST filter `bills.status = 'published' AND bills.archived_at IS NULL` ordered by `order_date` (uses `bills_status_archived_date_idx`).
6. **Respect D1's 100 bound-parameter limit:** D1 rejects queries with >100 SQL bind variables. Use `chunkForD1()` from `src/db/limits.ts` (safe cap: 80 params/query) for any `inArray` filter or multi-row `INSERT`.
7. **Keep writes lean (no redundant indexes, no unnecessary rewrites):**
   - Never add an index whose columns are a prefix of an existing non-partial index or primary key on the same table (enforced by `src/db/schema-guards.test.ts`).
   - Every foreign-key child column must have a supporting index (enforced by `src/db/schema-guards.test.ts`).
   - Prefer partial indexes (`WHERE status = '...'`) for low-cardinality active states so historical rows never bloat the index.
   - Normalize `players.email` to lowercase on write so `eq(players.email, ...)` hits `players_email_idx` without `LOWER(...)`.
8. **No `Bun.*` runtime APIs in Worker code:** `src/**` (excluding `*.test.ts`) runs on Cloudflare Workers; use Web Crypto, `uuidv7`, and standard Fetch/Web APIs.
9. **Migration safety:** Never commit a migration that drops a table while another table cascades from it (enforced by `src/db/migrations.test.ts`).

## UI, Mobile & Accessibility Rules

Every UI change or new view MUST satisfy these rules across both light and dark themes:

1. **First-class mobile and desktop layouts:** Both mobile and desktop versions must look intentional and balanced. On mobile, rearrange or stack layouts freely so the screen stays easy to scan, as long as all data and actions remain accessible.
2. **No unexpected horizontal scroll on mobile:** Never let cards, tables, pills, or long strings cause unintended horizontal overflow on mobile viewports (`min-w-0`, `truncate`, `flex-wrap`, or responsive stacking where needed).
3. **No visible vertical scrollbars on inner scrollable areas:** For scrollable modals, drawers, and inner panels (such as receipt previews), hide the vertical scrollbar (`[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`) and render subtle top/bottom fade shadows whenever content can scroll up or down.
4. **WCAG AA contrast in light and dark themes:** All text, icons, badges, inputs, and selected/active states must pass WCAG AA contrast (at least 4.5:1 for normal text and 3:1 for large text and UI components) in both light and dark themes. Avoid hardcoding colors that only work on one theme surface; prefer theme tokens (`--rt-*`) or `text-current` on inverted surfaces.
