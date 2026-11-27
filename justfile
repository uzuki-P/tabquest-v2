# List available recipes.
default:
    @just --list

# Run the dev server on the tabquest-v2 tailnet route.
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    port="$(dev-route port tabquest-v2)"
    exec bun run dev --port "$port"

# Build the production Cloudflare Workers bundle.
build:
    bun run build

# Deploy to Cloudflare Workers using wrangler.prod.jsonc (if present) or wrangler.jsonc.
deploy: build
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ -f wrangler.prod.jsonc ]]; then
        exec bunx wrangler deploy --config wrangler.prod.jsonc
    else
        exec bunx wrangler deploy
    fi

# Run unit tests with Bun.
test:
    bun test

# Run Playwright E2E tests against the local dev server; API calls are mocked, no D1 data needed (pass extra Playwright args).
e2e *args:
    bunx playwright test {{args}}

# Run only critical-flow Playwright E2E tests (auth/linking, bill create/edit/publish, transfer claims, Collect All, primary nav).
e2e-critical *args:
    bunx playwright test --grep @critical {{args}}

# Install the Chromium build Playwright needs (run once per Playwright upgrade).
e2e-install:
    bunx playwright install chromium-headless-shell

# Run TypeScript type checking.
typecheck:
    bun run typecheck

# Run Oxlint across the codebase.
lint:
    bun run lint

# Run all static checks and tests.
check: typecheck lint test

# Generate Drizzle SQL migrations from src/db/schema.ts.
db-generate:
    bun run db:generate

# Apply Drizzle SQL migrations to local Wrangler D1.
db-migrate-local:
    CI=true bunx wrangler d1 migrations apply tabquest-db --local

# Seed local Wrangler D1 from the legacy Turso SQLite snapshot and verify parity.
db-seed-local:
    bun run scripts/seed-from-turso.ts

# Upload legacy receipt images into local or remote Cloudflare R2 (--local | --remote).
r2-upload-legacy target="--local":
    bun run scripts/upload-legacy-images-to-r2.ts {{target}}
