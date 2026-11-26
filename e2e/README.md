# E2E tests

Playwright tests against the Vite dev server, in desktop and mobile (390px) Chromium.

```bash
just e2e-install   # once per Playwright upgrade
just e2e           # all specs; extra args go to Playwright, e.g. just e2e -g "edit bill"
```

## How it works

- **No database.** `support/api.ts` answers every `/api/*` request in the browser
  from `fixtures/data.json`. Mutations are recorded on `mock.mutations` and get a
  success reply shaped like the real API. Unknown calls get a 404, so new
  endpoints show up as failures.
- **Every test fails on console errors or page crashes** (`support/test.ts`).
  Expected ones go in `test.use({ allowedErrors: [...] })`.
- **Admin mode:** `test.use({ api: { as: "admin" } })`.
- **Slow responses:** `test.use({ api: { delays: [{ match: /regex/, ms } ] } })`.
- `waitForLoaded()` waits for hydration (`html[data-hydrated]`) and for every
  `PageLoading` to unmount. Clicks before hydration are lost.
- `global-setup.ts` visits every route once so Vite finishes optimizing
  dependencies before the first test.

## Specs

| Spec | Covers |
| --- | --- |
| `smoke.e2e.ts` | Every page in light and dark: renders, axe WCAG 2 A/AA, no horizontal scroll |
| `public-flows.e2e.ts` | Navigation, theme, callsign, pay card, bills archive, ranks, bill detail, dossier |
| `admin-flows.e2e.ts` | Bill tabs, archive/restore/publish, draft delete confirmation, collect drawer, edit bill (incl. paid-player warning), incomplete drafts, settings, payment methods, players, transfer claim |
| `loading-quip.e2e.ts` | Loading quip rotation across SSR, hydration and remounts |

## Fixtures

`fixtures/data.json` is an anonymized snapshot of real API responses: player and
account names, emails, phone numbers, notes and bank details are replaced with
fake values. It is typed in `support/api.ts`, so an API type change fails
`just typecheck`. When editing it by hand, keep it free of real personal data.
