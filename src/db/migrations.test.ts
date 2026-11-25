import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, test } from "bun:test"

/**
 * Guards against migrations that drop a table other tables cascade from.
 *
 * SQLite ignores `PRAGMA foreign_keys=OFF` inside a transaction. Dropping a
 * parent table there fires every child's `ON DELETE CASCADE` and erases the
 * child rows. drizzle-kit emits exactly that drop when it rebuilds a table,
 * for example to change a foreign key action.
 */

interface ForeignKeyMeta {
  tableFrom: string
  tableTo: string
  onDelete?: string
}

interface SnapshotTable {
  name: string
  foreignKeys?: Record<string, ForeignKeyMeta>
}

interface Snapshot {
  tables: Record<string, SnapshotTable>
}

interface JournalEntry {
  idx: number
  tag: string
}

interface Journal {
  entries: JournalEntry[]
}

interface Migration {
  name: string
  sql: string
  /** Schema after this migration, as written by drizzle-kit. */
  snapshot: Snapshot
}

const DROP_TABLE = /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"[]?(\w+)[`"\]]?/i

/** Maps each parent table to the child tables that cascade from it. */
function cascadeChildren(snapshot: Snapshot | undefined) {
  const children = new Map<string, Set<string>>()
  if (!snapshot) return children
  for (const table of Object.values(snapshot.tables)) {
    for (const fk of Object.values(table.foreignKeys ?? {})) {
      if (fk.onDelete?.toUpperCase() !== "CASCADE") continue
      if (!fk.tableFrom || !fk.tableTo) continue
      if (fk.tableFrom === fk.tableTo) continue
      const set = children.get(fk.tableTo) ?? new Set<string>()
      set.add(fk.tableFrom)
      children.set(fk.tableTo, set)
    }
  }
  return children
}

/**
 * Returns one message per statement that drops a table while another table
 * still cascades from it. The schema before each migration comes from the
 * previous migration's snapshot. Children dropped earlier in the same
 * migration no longer count.
 */
function findCascadingDrops(migrations: Migration[]): string[] {
  const problems: string[] = []
  migrations.forEach((migration, index) => {
    const children = cascadeChildren(migrations[index - 1]?.snapshot)
    const dropped = new Set<string>()
    for (const statement of migration.sql.split("--> statement-breakpoint")) {
      const table = DROP_TABLE.exec(statement)?.[1]
      if (!table) continue
      const live = [...(children.get(table) ?? [])].filter(
        (child) => !dropped.has(child)
      )
      if (live.length > 0) {
        problems.push(
          `${migration.name} drops \`${table}\`, which ${live.join(", ")} cascade from`
        )
      }
      dropped.add(table)
    }
  })
  return problems
}

function loadMigrations(folder: string): Migration[] {
  const journalPath = path.join(folder, "meta", "_journal.json")
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal
  return journal.entries.map((entry) => {
    const prefix = String(entry.idx).padStart(4, "0")
    const sqlPath = path.join(folder, `${entry.tag}.sql`)
    const snapshotPath = path.join(folder, "meta", `${prefix}_snapshot.json`)
    return {
      name: entry.tag,
      sql: readFileSync(sqlPath, "utf8"),
      snapshot: JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot,
    }
  })
}

const parentWithCascadingChild: Snapshot = {
  tables: {
    players: { name: "players", foreignKeys: {} },
    payments: {
      name: "payments",
      foreignKeys: {
        payments_player_id_players_id_fk: {
          tableFrom: "payments",
          tableTo: "players",
          onDelete: "cascade",
        },
      },
    },
  },
}

describe("findCascadingDrops", () => {
  test("flags a table rebuild of a cascade parent", () => {
    const rebuild = [
      "CREATE TABLE `__new_players` (`id` text PRIMARY KEY NOT NULL);",
      "INSERT INTO `__new_players`(`id`) SELECT `id` FROM `players`;",
      "DROP TABLE `players`;",
      "ALTER TABLE `__new_players` RENAME TO `players`;",
    ].join("--> statement-breakpoint\n")
    const problems = findCascadingDrops([
      { name: "0000_init", sql: "", snapshot: parentWithCascadingChild },
      {
        name: "0001_rebuild",
        sql: rebuild,
        snapshot: parentWithCascadingChild,
      },
    ])
    expect(problems).toEqual([
      "0001_rebuild drops `players`, which payments cascade from",
    ])
  })

  test("allows dropping a parent after its cascading children", () => {
    const sql = [
      "DROP TABLE IF EXISTS `payments`;",
      'DROP TABLE "players";',
    ].join("--> statement-breakpoint\n")
    const problems = findCascadingDrops([
      { name: "0000_init", sql: "", snapshot: parentWithCascadingChild },
      { name: "0001_drop", sql, snapshot: { tables: {} } },
    ])
    expect(problems).toEqual([])
  })
})

test("no migration drops a table that other tables cascade from", () => {
  const migrations = loadMigrations(
    path.resolve(import.meta.dir, "../../drizzle")
  )
  expect(migrations.length).toBeGreaterThan(0)
  expect(findCascadingDrops(migrations)).toEqual([])
})
