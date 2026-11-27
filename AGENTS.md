# Tabquest v2 Engineering Rules

Run `just check` (`tsc --noEmit`, `oxlint`, and `bun test`) after code changes. Many project rules are enforced automatically via [.oxlintrc.json](.oxlintrc.json) and guard tests ([src/db/schema-guards.test.ts](src/db/schema-guards.test.ts), [src/db/code-guards.test.ts](src/db/code-guards.test.ts), [src/db/migrations.test.ts](src/db/migrations.test.ts), and [src/components/ui-guards.test.ts](src/components/ui-guards.test.ts)).

**E2E policy (critical flows only):** Do not run the full Playwright suite or add E2E specs for every change. During development, run `just check` for routine changes and `just e2e-critical` (fast desktop critical flows + home accessibility smoke) when changing critical flows (home roster/pay card, sign-in & player linking, bill creation/editing/publishing, transfer claims & Admin Collect All, or primary route navigation). CI runs the full desktop + mobile `just e2e` suite on `main` before deploy. For visual polish, animations, badges, hover cards, and layout tweaks, rely on `just check` and fast `bun test` unit tests instead.

Read the relevant guide before working in that area:

- **Database, Cloudflare D1, migrations, or server queries:** Read [docs/d1-rules.md](docs/d1-rules.md) (no `db.transaction()`, no N+1 queries, `db.batch()`, `bill_players` split snapshots, partial indexes, `chunkForD1`, no `Bun.*` in Worker code, migration safety).
- **UI, mobile layout, themes, or navigation:** Read [docs/ui-rules.md](docs/ui-rules.md) (mobile/desktop balance, no horizontal overflow, hidden inner vertical scrollbars with fade shadows, WCAG AA contrast in light/dark themes, instant feedback and loading states on clicks and route transitions).
