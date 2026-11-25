import { sql } from "drizzle-orm"
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

/**
 * Tabquest v2 Cloudflare D1 schema.
 *
 * Conventions:
 * - Money columns are integer rupiah.
 * - Order dates are `YYYY-MM-DD` calendar dates in the bill's timezone
 *   (Asia/Jakarta).
 * - Domain timestamps are UTC ISO-8601 strings; Better Auth timestamps use
 *   SQLite integer epoch milliseconds (`timestamp_ms`) per Better Auth's
 *   Drizzle SQLite adapter.
 */

// ---------------------------------------------------------------------------
// Better Auth tables (better-auth v1.7 + admin plugin)
// ---------------------------------------------------------------------------

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    // Admin plugin columns
    role: text("role"),
    banned: integer("banned", { mode: "boolean" }).default(false),
    banReason: text("ban_reason"),
    banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("user_email_uq").on(t.email)]
)

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Admin plugin column
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [
    uniqueIndex("session_token_uq").on(t.token),
    index("session_user_id_idx").on(t.userId),
  ]
)

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("account_user_id_idx").on(t.userId),
    index("account_provider_account_idx").on(t.providerId, t.accountId),
  ]
)

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)]
)

// ---------------------------------------------------------------------------
// Core Tabquest tables (zero-data-loss parity with legacy v1 + v2 columns)
// ---------------------------------------------------------------------------

export const bills = sqliteTable(
  "bills",
  {
    /** UUIDv7 sortable internal ID. */
    id: text("id").primaryKey(),
    /** Opaque public ID used in /b/{public-id} URLs. */
    publicId: text("public_id").notNull(),
    merchant: text("merchant").notNull(),
    title: text("title"),
    orderDate: text("order_date").notNull(),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    currency: text("currency").notNull().default("IDR"),
    sourceSubtotal: integer("source_subtotal").notNull(),
    finalTotal: integer("final_total").notNull(),
    /** draft | published */
    status: text("status").notNull().default("draft"),
    imageObjectKey: text("image_object_key"),
    imageMediaType: text("image_media_type"),
    imageByteSize: integer("image_byte_size"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    publishedAt: text("published_at"),
    /** Set when the bill is archived; archive hides it from lists only. */
    archivedAt: text("archived_at"),
    /**
     * Split rules the bill was published under (see src/domain/split.ts).
     * 1: every adjustment by item share. 2: flat fees per head, rounding to
     * the admin. Drafts and new bills use the current rules.
     */
    splitVersion: integer("split_version").notNull().default(2),
    /**
     * billPlayer who took leftover rounding rupiah, fixed at publish so
     * moving the players' "takes rounding" flag never changes a published
     * bill. Null on drafts, which follow the live flag.
     */
    roundingBillPlayerId: text("rounding_bill_player_id"),
  },
  (t) => [
    index("bills_status_archived_date_idx").on(
      t.status,
      t.archivedAt,
      t.orderDate
    ),
    uniqueIndex("bills_public_id_uq").on(t.publicId),
  ]
)

/**
 * People the admin can pick again on the next order. The service refuses to
 * delete a player that bills still reference, so recorded history keeps its
 * links; the FK's set-null is a last-resort net, not the guard.
 */
export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone"),
    note: text("note"),
    archivedAt: text("archived_at"),
    /** The admin: takes leftover rounding rupiah. At most one player. */
    takesRounding: integer("takes_rounding", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Linked Better Auth user account (nullable for unlinked legacy players). */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Optional admin pre-link email so first verified Google sign-in auto-links. */
    email: text("email"),
    /** R2 object key for custom player avatar, when uploaded. */
    avatarObjectKey: text("avatar_object_key"),
    /** Admin moderation flag preventing the player from uploading custom avatars. */
    avatarBanned: integer("avatar_banned", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Admin moderation flag preventing the player from editing their own name. */
    nameLocked: integer("name_locked", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("players_name_idx").on(t.name),
    uniqueIndex("players_user_id_uq").on(t.userId),
    index("players_email_idx").on(t.email),
  ]
)

/** Precomputed public hover details. Rebuilt when published bill data changes. */
export const playerHoverSummaries = sqliteTable("player_hover_summaries", {
  playerId: text("player_id")
    .primaryKey()
    .references(() => players.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  totalSpend: integer("total_spend").notNull(),
  totalTips: integer("total_tips").notNull(),
  orderCount: integer("order_count").notNull(),
  badgesJson: text("badges_json").notNull(),
})

export const billPlayers = sqliteTable(
  "bill_players",
  {
    id: text("id").primaryKey(),
    billId: text("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    sortOrder: integer("sort_order").notNull(),
    /** The directory player this row represents; null only on legacy rows. */
    playerId: text("player_id").references(() => players.id, {
      onDelete: "set null",
    }),
    /**
     * Denormalized split snapshot (integer rupiah), computed once on save/publish.
     * Allows Home, Ranks, Tip Wall, Player Insights, and Admin Collect All to
     * query `bills + bill_players + payment_statuses` without scanning `items`
     * or `*_allocations` (~10x fewer D1 rows read, 0 extra write rows).
     */
    itemSubtotal: integer("item_subtotal").notNull().default(0),
    adjustmentTotal: integer("adjustment_total").notNull().default(0),
    shareAmount: integer("share_amount").notNull().default(0),
  },
  (t) => [
    index("bill_players_bill_idx").on(t.billId),
    index("bill_players_player_idx").on(t.playerId),
  ]
)

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    billId: text("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    variantNotes: text("variant_notes"),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    lineTotal: integer("line_total").notNull(),
    bundleSize: integer("bundle_size").notNull().default(1),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [index("items_bill_idx").on(t.billId)]
)

export const itemAllocations = sqliteTable(
  "item_allocations",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    billPlayerId: text("bill_player_id")
      .notNull()
      .references(() => billPlayers.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    uniqueIndex("item_allocations_item_bill_player_uq").on(
      t.itemId,
      t.billPlayerId
    ),
    index("item_allocations_bill_player_idx").on(t.billPlayerId),
  ]
)

export const adjustments = sqliteTable(
  "adjustments",
  {
    id: text("id").primaryKey(),
    billId: text("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    /** discount | delivery | service | tax | other */
    type: text("type").notNull(),
    label: text("label").notNull(),
    /** Signed: discounts negative, fees positive. */
    signedAmount: integer("signed_amount").notNull(),
    /**
     * Amount as printed on the source receipt when the net differs, e.g. a
     * delivery fee printed as Rp3.500 but waived to Rp0 by a voucher.
     * Display-only; the split math only ever reads signedAmount.
     */
    originalAmount: integer("original_amount"),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [index("adjustments_bill_idx").on(t.billId)]
)

export const adjustmentAllocations = sqliteTable(
  "adjustment_allocations",
  {
    id: text("id").primaryKey(),
    adjustmentId: text("adjustment_id")
      .notNull()
      .references(() => adjustments.id, { onDelete: "cascade" }),
    billPlayerId: text("bill_player_id")
      .notNull()
      .references(() => billPlayers.id, { onDelete: "cascade" }),
    signedAmount: integer("signed_amount").notNull(),
  },
  (t) => [
    uniqueIndex("adjustment_allocations_adj_bill_player_uq").on(
      t.adjustmentId,
      t.billPlayerId
    ),
    index("adjustment_allocations_bill_player_idx").on(t.billPlayerId),
  ]
)

export const paymentStatuses = sqliteTable(
  "payment_statuses",
  {
    billPlayerId: text("bill_player_id")
      .primaryKey()
      .references(() => billPlayers.id, { onDelete: "cascade" }),
    /** unpaid | paid */
    status: text("status").notNull().default("unpaid"),
    /**
     * What the billPlayer actually handed over, as the admin recorded it.
     * Null until recorded; the split math never reads this. May sit above the
     * share (rounded up) or below it (came up short).
     */
    paidAmount: integer("paid_amount"),
    paidAt: text("paid_at"),
    lastChangedBy: text("last_changed_by"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("payment_statuses_unpaid_idx")
      .on(t.billPlayerId)
      .where(sql`${t.status} = 'unpaid'`),
  ]
)

export const paymentEvents = sqliteTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    billPlayerId: text("bill_player_id")
      .notNull()
      .references(() => billPlayers.id, { onDelete: "cascade" }),
    previousState: text("previous_state").notNull(),
    newState: text("new_state").notNull(),
    actorIdentity: text("actor_identity").notNull(),
    eventTime: text("event_time").notNull(),
  },
  (t) => [index("payment_events_bill_player_idx").on(t.billPlayerId)]
)

// ---------------------------------------------------------------------------
// New v2 tables: Transfer Claims & App Settings
// ---------------------------------------------------------------------------

/**
 * Self-reported "Pay All" transfers submitted by signed-in, linked players.
 * Surfaced in the Admin Collect All desk for 1-click confirmation or dismissal.
 */
export const transferClaims = sqliteTable(
  "transfer_claims",
  {
    id: text("id").primaryKey(),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    claimedAmount: integer("claimed_amount").notNull(),
    expectedOwedAtClaim: integer("expected_owed_at_claim").notNull(),
    billPlayerIdsJson: text("bill_player_ids_json").notNull(),
    /** pending | confirmed | dismissed */
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
    resolvedBy: text("resolved_by"),
  },
  (t) => [
    index("transfer_claims_player_idx").on(t.playerId),
    index("transfer_claims_pending_idx")
      .on(t.playerId)
      .where(sql`${t.status} = 'pending'`),
  ]
)

/**
 * Singleton app configuration row (`id = "default"`):
 * - White-label branding (publicly readable)
 * - Multiple payment methods JSON (strictly authenticated-only in API responses)
 */
export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey().default("default"),
  appName: text("app_name"),
  tagline: text("tagline"),
  iconUrl: text("icon_url"),
  paymentMethodsJson: text("payment_methods_json").notNull().default("[]"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
})

export type UserRow = typeof user.$inferSelect
export type SessionRow = typeof session.$inferSelect
export type AccountRow = typeof account.$inferSelect
export type VerificationRow = typeof verification.$inferSelect
export type BillRow = typeof bills.$inferSelect
export type PlayerRow = typeof players.$inferSelect
export type PlayerHoverSummaryRow = typeof playerHoverSummaries.$inferSelect
export type BillPlayerRow = typeof billPlayers.$inferSelect
export type ItemRow = typeof items.$inferSelect
export type ItemAllocationRow = typeof itemAllocations.$inferSelect
export type AdjustmentRow = typeof adjustments.$inferSelect
export type AdjustmentAllocationRow = typeof adjustmentAllocations.$inferSelect
export type PaymentStatusRow = typeof paymentStatuses.$inferSelect
export type PaymentEventRow = typeof paymentEvents.$inferSelect
export type TransferClaimRow = typeof transferClaims.$inferSelect
export type AppSettingsRow = typeof appSettings.$inferSelect
