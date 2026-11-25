CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `account_provider_account_idx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `adjustment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`adjustment_id` text NOT NULL,
	`bill_player_id` text NOT NULL,
	`signed_amount` integer NOT NULL,
	FOREIGN KEY (`adjustment_id`) REFERENCES `adjustments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bill_player_id`) REFERENCES `bill_players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adjustment_allocations_adj_bill_player_uq` ON `adjustment_allocations` (`adjustment_id`,`bill_player_id`);--> statement-breakpoint
CREATE INDEX `adjustment_allocations_bill_player_idx` ON `adjustment_allocations` (`bill_player_id`);--> statement-breakpoint
CREATE TABLE `adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`signed_amount` integer NOT NULL,
	`original_amount` integer,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `adjustments_bill_idx` ON `adjustments` (`bill_id`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`app_name` text,
	`tagline` text,
	`icon_url` text,
	`payment_methods_json` text DEFAULT '[]' NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `bill_players` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`alias` text NOT NULL,
	`sort_order` integer NOT NULL,
	`player_id` text,
	`item_subtotal` integer DEFAULT 0 NOT NULL,
	`adjustment_total` integer DEFAULT 0 NOT NULL,
	`share_amount` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bill_players_bill_idx` ON `bill_players` (`bill_id`);--> statement-breakpoint
CREATE INDEX `bill_players_player_idx` ON `bill_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`merchant` text NOT NULL,
	`title` text,
	`order_date` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Jakarta' NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`source_subtotal` integer NOT NULL,
	`final_total` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`image_object_key` text,
	`image_media_type` text,
	`image_byte_size` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`archived_at` text,
	`split_version` integer DEFAULT 2 NOT NULL,
	`rounding_bill_player_id` text
);
--> statement-breakpoint
CREATE INDEX `bills_status_archived_date_idx` ON `bills` (`status`,`archived_at`,`order_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `bills_public_id_uq` ON `bills` (`public_id`);--> statement-breakpoint
CREATE TABLE `item_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`bill_player_id` text NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bill_player_id`) REFERENCES `bill_players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_allocations_item_bill_player_uq` ON `item_allocations` (`item_id`,`bill_player_id`);--> statement-breakpoint
CREATE INDEX `item_allocations_bill_player_idx` ON `item_allocations` (`bill_player_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL,
	`name` text NOT NULL,
	`variant_notes` text,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`line_total` integer NOT NULL,
	`bundle_size` integer DEFAULT 1 NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `items_bill_idx` ON `items` (`bill_id`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_player_id` text NOT NULL,
	`previous_state` text NOT NULL,
	`new_state` text NOT NULL,
	`actor_identity` text NOT NULL,
	`event_time` text NOT NULL,
	FOREIGN KEY (`bill_player_id`) REFERENCES `bill_players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payment_events_bill_player_idx` ON `payment_events` (`bill_player_id`);--> statement-breakpoint
CREATE TABLE `payment_statuses` (
	`bill_player_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'unpaid' NOT NULL,
	`paid_amount` integer,
	`paid_at` text,
	`last_changed_by` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`bill_player_id`) REFERENCES `bill_players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payment_statuses_unpaid_idx` ON `payment_statuses` (`bill_player_id`) WHERE "payment_statuses"."status" = 'unpaid';--> statement-breakpoint
CREATE TABLE `player_hover_summaries` (
	`player_id` text PRIMARY KEY NOT NULL,
	`rank` integer NOT NULL,
	`total_spend` integer NOT NULL,
	`total_tips` integer NOT NULL,
	`order_count` integer NOT NULL,
	`badges_json` text NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`note` text,
	`archived_at` text,
	`takes_rounding` integer DEFAULT false NOT NULL,
	`user_id` text,
	`email` text,
	`avatar_object_key` text,
	`avatar_banned` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `players_name_idx` ON `players` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_user_id_uq` ON `players` (`user_id`);--> statement-breakpoint
CREATE INDEX `players_email_idx` ON `players` (`email`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_uq` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `transfer_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`claimed_amount` integer NOT NULL,
	`expected_owed_at_claim` integer NOT NULL,
	`bill_player_ids_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	`resolved_by` text,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `transfer_claims_player_idx` ON `transfer_claims` (`player_id`);--> statement-breakpoint
CREATE INDEX `transfer_claims_pending_idx` ON `transfer_claims` (`player_id`) WHERE "transfer_claims"."status" = 'pending';--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_uq` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);