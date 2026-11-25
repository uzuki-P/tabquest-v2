import { Database as SqliteDatabase } from "bun:sqlite"
import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, test } from "bun:test"

import { D1_MAX_BIND_PARAMS, chunkForD1 } from "./limits"

/**
 * Automated D1 read/write performance guardrails:
 * 1. No redundant indexes (an index that is a prefix of another non-partial
 *    index or primary key wastes write I/O on every mutation).
 * 2. Every foreign key child column list is backed by an index or primary key
 *    (prevents full-table scans on JOINs and ON DELETE CASCADE).
 * 3. Every hot application query executes with an index SEARCH, never a full
 *    table SCAN, verified via SQLite EXPLAIN QUERY PLAN against the actual
 *    generated Drizzle migrations.
 */

interface SnapshotColumn {
  name: string
  primaryKey?: boolean
}

interface SnapshotIndex {
  name: string
  columns: string[]
  isUnique: boolean
  where?: string
}

interface SnapshotFk {
  name: string
  tableFrom: string
  tableTo: string
  columnsFrom: string[]
  columnsTo: string[]
}

interface SnapshotTable {
  name: string
  columns: Record<string, SnapshotColumn>
  indexes?: Record<string, SnapshotIndex>
  foreignKeys?: Record<string, SnapshotFk>
}

interface Snapshot {
  tables: Record<string, SnapshotTable>
}

interface Journal {
  entries: Array<{ idx: number; tag: string }>
}

const DRIZZLE_DIR = path.resolve(import.meta.dir, "../../drizzle")

function loadLatestSnapshot(): Snapshot {
  const journal = JSON.parse(
    readFileSync(path.join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8")
  ) as Journal
  const latest = journal.entries.at(-1)
  if (!latest) throw new Error("No Drizzle migrations found")
  const prefix = String(latest.idx).padStart(4, "0")
  return JSON.parse(
    readFileSync(
      path.join(DRIZZLE_DIR, "meta", `${prefix}_snapshot.json`),
      "utf8"
    )
  ) as Snapshot
}

function createMigratedMemoryDb(): SqliteDatabase {
  const db = new SqliteDatabase(":memory:")
  const journal = JSON.parse(
    readFileSync(path.join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8")
  ) as Journal
  for (const entry of journal.entries) {
    const sql = readFileSync(
      path.join(DRIZZLE_DIR, `${entry.tag}.sql`),
      "utf8"
    )
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim()
      if (trimmed) db.exec(trimmed)
    }
  }
  return db
}

function isPrefix(shorter: readonly string[], longer: readonly string[]) {
  if (shorter.length > longer.length) return false
  return shorter.every((col, idx) => longer[idx] === col)
}

function explainPlan(db: SqliteDatabase, query: string): string[] {
  const rows = db
    .query<{ detail: string }, []>(`EXPLAIN QUERY PLAN ${query}`)
    .all()
  return rows.map((r) => r.detail)
}

describe("D1 schema read/write guards", () => {
  test("no redundant non-partial indexes exist (avoids wasted writes)", () => {
    const snapshot = loadLatestSnapshot()
    const redundant: string[] = []

    for (const table of Object.values(snapshot.tables)) {
      const pkCols = Object.values(table.columns)
        .filter((c) => c.primaryKey)
        .map((c) => c.name)
      const fullIndexes = Object.values(table.indexes ?? {}).filter(
        (idx) => !idx.where
      )

      for (const idx of fullIndexes) {
        if (pkCols.length > 0 && isPrefix(idx.columns, pkCols)) {
          redundant.push(
            `${table.name}.${idx.name} (${idx.columns.join(", ")}) is redundant with PRIMARY KEY (${pkCols.join(", ")})`
          )
        }
        for (const other of fullIndexes) {
          if (idx.name === other.name) continue
          if (isPrefix(idx.columns, other.columns)) {
            // If both have identical columns, only flag once deterministically.
            if (
              idx.columns.length === other.columns.length &&
              idx.name > other.name
            ) {
              continue
            }
            redundant.push(
              `${table.name}.${idx.name} (${idx.columns.join(", ")}) is covered by ${other.name} (${other.columns.join(", ")})`
            )
          }
        }
      }
    }

    expect(redundant).toEqual([])
  })

  test("every foreign key has a supporting index or primary key", () => {
    const snapshot = loadLatestSnapshot()
    const unindexedFks: string[] = []

    for (const table of Object.values(snapshot.tables)) {
      const pkCols = Object.values(table.columns)
        .filter((c) => c.primaryKey)
        .map((c) => c.name)
      const fullIndexes = Object.values(table.indexes ?? {}).filter(
        (idx) => !idx.where
      )

      for (const fk of Object.values(table.foreignKeys ?? {})) {
        const coveredByPk =
          pkCols.length > 0 && isPrefix(fk.columnsFrom, pkCols)
        const coveredByIndex = fullIndexes.some((idx) =>
          isPrefix(fk.columnsFrom, idx.columns)
        )
        if (!coveredByPk && !coveredByIndex) {
          unindexedFks.push(
            `${table.name}.${fk.name} (${fk.columnsFrom.join(", ")}) has no supporting index`
          )
        }
      }
    }

    expect(unindexedFks).toEqual([])
  })

  test("hot queries use indexes instead of full table scans", () => {
    const db = createMigratedMemoryDb()
    try {
      const hotQueries: Array<{ name: string; sql: string; index: string }> = [
        {
          name: "published bills feed",
          sql: "SELECT id, merchant, order_date, final_total FROM bills WHERE status = 'published' AND archived_at IS NULL ORDER BY order_date DESC",
          index: "bills_status_archived_date_idx",
        },
        {
          name: "public bill lookup by public_id",
          sql: "SELECT id FROM bills WHERE public_id = 'abc'",
          index: "bills_public_id_uq",
        },
        {
          name: "unpaid payment statuses (partial index)",
          sql: "SELECT bill_player_id FROM payment_statuses WHERE status = 'unpaid'",
          index: "payment_statuses_unpaid_idx",
        },
        {
          name: "pending transfer claims (partial index)",
          sql: "SELECT id, player_id, claimed_amount FROM transfer_claims WHERE status = 'pending'",
          index: "transfer_claims_pending_idx",
        },
        {
          name: "Google OAuth account lookup",
          sql: "SELECT user_id FROM account WHERE provider_id = 'google' AND account_id = '123'",
          index: "account_provider_account_idx",
        },
        {
          name: "player lookup by linked user_id",
          sql: "SELECT id FROM players WHERE user_id = 'u1'",
          index: "players_user_id_uq",
        },
        {
          name: "player auto-link lookup by email",
          sql: "SELECT id FROM players WHERE email = 'user@example.com'",
          index: "players_email_idx",
        },
        {
          name: "item allocations by bill_player_id",
          sql: "SELECT item_id, quantity FROM item_allocations WHERE bill_player_id = 'bp1'",
          index: "item_allocations_bill_player_idx",
        },
        {
          name: "adjustment allocations by bill_player_id",
          sql: "SELECT adjustment_id, signed_amount FROM adjustment_allocations WHERE bill_player_id = 'bp1'",
          index: "adjustment_allocations_bill_player_idx",
        },
      ]

      for (const check of hotQueries) {
        const plan = explainPlan(db, check.sql).join(" | ")
        expect(plan, `${check.name} plan: ${plan}`).toContain(check.index)
      }
    } finally {
      db.close()
    }
  })
})

describe("chunkForD1", () => {
  test("chunks single-parameter lists at D1_MAX_BIND_PARAMS", () => {
    const ids = Array.from({ length: 185 }, (_, i) => `id-${i}`)
    const chunks = chunkForD1(ids)
    expect(chunks.map((c) => c.length)).toEqual([
      D1_MAX_BIND_PARAMS,
      D1_MAX_BIND_PARAMS,
      25,
    ])
  })

  test("chunks multi-column inserts so total bind params stay <= 80", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: i }))
    // 8 columns per row => floor(80 / 8) = 10 rows per batch
    const chunks = chunkForD1(rows, 8)
    expect(chunks.map((c) => c.length)).toEqual([10, 10, 5])
  })

  test("returns empty array for empty input", () => {
    expect(chunkForD1([])).toEqual([])
  })
})
