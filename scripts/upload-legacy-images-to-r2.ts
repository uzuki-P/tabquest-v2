#!/usr/bin/env bun
/**
 * Upload legacy Tabquest receipt images (.webp) into Cloudflare R2
 * (`tabquest-receipts` by default), preserving exact `<uuid>.webp` object keys
 * so every `bills.image_object_key` resolves seamlessly.
 *
 * Usage:
 *   bun run scripts/upload-legacy-images-to-r2.ts [--local | --remote] [--dir <path>] [--source <sqlite>] [--bucket <name>]
 */
import { Database as SqliteDatabase } from "bun:sqlite"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"

const DEFAULT_UPLOAD_DIR = "./data/uploads"
const DEFAULT_SOURCE_DB = "./data/tabquest-turso.db"
const DEFAULT_BUCKET = "tabquest-receipts"

function parseArgs(argv: string[]) {
  let remote = false
  let dir = DEFAULT_UPLOAD_DIR
  let sourceDb = DEFAULT_SOURCE_DB
  let bucket = DEFAULT_BUCKET

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--remote") {
      remote = true
    } else if (arg === "--local") {
      remote = false
    } else if (arg === "--dir" && argv[i + 1]) {
      dir = argv[i + 1]
      i += 1
    } else if (arg === "--source" && argv[i + 1]) {
      sourceDb = argv[i + 1]
      i += 1
    } else if (arg === "--bucket" && argv[i + 1]) {
      bucket = argv[i + 1]
      i += 1
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/upload-legacy-images-to-r2.ts [--local | --remote] [--dir <path>] [--source <sqlite>] [--bucket <name>]"
      )
      process.exit(0)
    }
  }

  return { remote, dir, sourceDb, bucket }
}

function contentTypeFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  if (ext === ".webp") return "image/webp"
  if (ext === ".png") return "image/png"
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  return "application/octet-stream"
}

function main() {
  const { remote, dir, sourceDb, bucket } = parseArgs(process.argv.slice(2))

  if (!existsSync(dir)) {
    throw new Error(`Upload directory not found: ${dir}`)
  }

  const files = readdirSync(dir)
    .filter((f) => /\.(webp|png|jpe?g)$/i.test(f))
    .sort()

  if (files.length === 0) {
    console.log(`No image files found in ${dir}.`)
    return
  }

  const fileSet = new Set(files)

  // Verify every bills.image_object_key in source snapshot exists on disk
  if (existsSync(sourceDb)) {
    const db = new SqliteDatabase(sourceDb, { readonly: true })
    const referenced = db
      .query<{ id: string; merchant: string; image_object_key: string }, []>(
        "SELECT id, merchant, image_object_key FROM bills WHERE image_object_key IS NOT NULL AND TRIM(image_object_key) != ''"
      )
      .all()
    db.close()

    const missing = referenced.filter((r) => !fileSet.has(r.image_object_key))
    if (missing.length > 0) {
      console.error(
        `Missing ${missing.length} receipt file(s) referenced by bills:`
      )
      for (const m of missing) {
        console.error(`  - ${m.image_object_key} (bill ${m.id}: ${m.merchant})`)
      }
      process.exit(1)
    }
    console.log(
      `Verified all ${referenced.length} bill image_object_key references exist in ${dir}.`
    )
  }

  const targetFlag = remote ? "--remote" : "--local"
  console.log(
    `Uploading ${files.length} image(s) to R2 bucket "${bucket}" (${targetFlag})...`
  )

  let uploaded = 0
  for (const filename of files) {
    const fullPath = path.join(dir, filename)
    const contentType = contentTypeFor(filename)
    const res = spawnSync(
      "bunx",
      [
        "wrangler",
        "r2",
        "object",
        "put",
        `${bucket}/${filename}`,
        "--file",
        fullPath,
        "--content-type",
        contentType,
        targetFlag,
      ],
      { encoding: "utf8" }
    )
    if (res.status !== 0) {
      throw new Error(
        `Failed uploading ${filename} (${res.status}):\n${res.stdout}\n${res.stderr}`
      )
    }
    uploaded += 1
    if (uploaded % 10 === 0 || uploaded === files.length) {
      console.log(`  Uploaded ${uploaded}/${files.length}...`)
    }
  }

  console.log(
    `Done! Uploaded ${uploaded} legacy receipt image(s) to ${bucket} (${targetFlag}).`
  )
}

main()
