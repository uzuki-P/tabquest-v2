import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

const SRC_ROOT = join(import.meta.dir, "..")

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "prototypes") continue
      out.push(...collectSourceFiles(full))
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      out.push(full)
    }
  }
  return out
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "")
}

describe("D1 & Worker code guards", () => {
  const files = collectSourceFiles(SRC_ROOT)

  it("forbids interactive db.transaction() calls in Worker code", () => {
    const violations: string[] = []
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"))
      const lines = code.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (/\b\w+\.transaction\s*\(/.test(lines[i])) {
          violations.push(`${relative(SRC_ROOT, file)}:${i + 1}: ${lines[i].trim()}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it("forbids Bun.* globals and bun:* imports in Worker code", () => {
    const violations: string[] = []
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"))
      const lines = code.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (/\bBun\./.test(lines[i]) || /from\s+["']bun:/.test(lines[i])) {
          violations.push(`${relative(SRC_ROOT, file)}:${i + 1}: ${lines[i].trim()}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it("forbids SQL LOWER(...) on email columns (normalize on write instead)", () => {
    const violations: string[] = []
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"))
      const lines = code.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (/\bLOWER\s*\([^)]*email/i.test(lines[i])) {
          violations.push(`${relative(SRC_ROOT, file)}:${i + 1}: ${lines[i].trim()}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it("restricts itemized allocation table imports to bill detail/edit services", () => {
    const allowed = new Set([
      "db/schema.ts",
      "server/services/bills.ts",
      "server/services/queries.ts",
    ])
    const violations: string[] = []
    for (const file of files) {
      const rel = relative(SRC_ROOT, file)
      if (allowed.has(rel)) continue
      const code = stripComments(readFileSync(file, "utf8"))
      if (/\b(itemAllocations|adjustmentAllocations)\b/.test(code)) {
        violations.push(`${rel}: references itemized allocation tables outside allowed detail/edit services`)
      }
    }
    expect(violations).toEqual([])
  })
})
