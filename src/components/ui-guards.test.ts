import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

const SRC_ROOT = join(import.meta.dir, "..")

function collectTsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "prototypes") continue
      out.push(...collectTsxFiles(full))
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      out.push(full)
    }
  }
  return out
}

describe("UI, mobile & accessibility guards", () => {
  const files = [
    ...collectTsxFiles(join(SRC_ROOT, "routes")),
    ...collectTsxFiles(join(SRC_ROOT, "components")),
  ]

  it("hides vertical scrollbars on all inner overflow-y-auto / overflow-auto containers", () => {
    const violations: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n")
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!/\boverflow-(?:y-)?auto\b/.test(line)) continue
        const hasHiddenScrollbar =
          line.includes("[scrollbar-width:none]") ||
          line.includes("rt2-scroll-fade-y")
        if (!hasHiddenScrollbar) {
          violations.push(`${relative(SRC_ROOT, file)}:${i + 1}: ${line.trim()}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it("avoids hardcoded hex text colors on inverted bg-[var(--rt-ink)] surfaces", () => {
    const violations: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n")
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes("bg-[var(--rt-ink)]") && /text-\[#[0-9a-fA-F]{3,8}\]/.test(line)) {
          violations.push(`${relative(SRC_ROOT, file)}:${i + 1}: ${line.trim()}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it("avoids unguarded wide fixed widths (>320px) that can cause mobile horizontal overflow", () => {
    const violations: string[] = []
    const widthRe = /(?<![a-zA-Z0-9:-])w-\[(\d+)px\]/g
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n")
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        for (const match of line.matchAll(widthRe)) {
          const px = Number(match[1])
          if (px > 320 && !line.includes("max-w-")) {
            violations.push(`${relative(SRC_ROOT, file)}:${i + 1}: w-[${px}px] without max-w-*`)
          }
        }
      }
    }
    expect(violations).toEqual([])
  })

  it("configures immediate router pending fallback for lazy route chunks", () => {
    const routerSource = readFileSync(join(SRC_ROOT, "router.tsx"), "utf8")
    expect(routerSource).toContain("defaultPendingMs: 0")
    expect(routerSource).toContain("defaultPendingComponent")
  })

  it("uses resolvedLocation for route transition containers so outgoing pages never re-animate", () => {
    for (const rel of ["routes/__root.tsx", "routes/admin.tsx"]) {
      const source = readFileSync(join(SRC_ROOT, rel), "utf8")
      expect(source, `${rel} should track resolvedLocation`).toContain(
        "resolvedLocation"
      )
      expect(source, `${rel} should render PageLoading while pending`).toContain(
        "<PageLoading"
      )
    }
  })
})
