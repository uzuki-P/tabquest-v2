import { drizzle } from "drizzle-orm/d1"

import * as schema from "./schema"

export * from "./limits"
export * from "./schema"

/**
 * Creates a Drizzle ORM client bound to a Cloudflare D1 database instance.
 *
 * Guardrail: Cloudflare D1 does not support interactive async transactions
 * (`db.transaction(async (tx) => ...)`). Compose multi-statement writes as
 * atomic `db.batch([...])` calls instead.
 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Database = ReturnType<typeof createDb>
