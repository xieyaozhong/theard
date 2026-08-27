CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL COLLATE NOCASE,
	`name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'PUBLISHED' NOT NULL CHECK (`status` IN ('DRAFT','PUBLISHED','CLOSED')),
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_code_unique` ON `events` (`code`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`code` text NOT NULL COLLATE NOCASE,
	`event_date` text NOT NULL,
	`start_time` text NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL CHECK (`status` IN ('OPEN','CLOSED')),
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_event_code_date_unique` ON `sessions` (`event_id`,`code`,`event_date`);--> statement-breakpoint
CREATE INDEX `idx_sessions_event_date` ON `sessions` (`event_id`,`event_date`,`start_time`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`serial` text NOT NULL COLLATE NOCASE,
	`pass_type` text NOT NULL,
	`rarity` text NOT NULL,
	`zone` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL CHECK (`status` IN ('ACTIVE','USED','REVOKED')),
	`draw_code` text NOT NULL COLLATE NOCASE,
	`draw_code_key` text NOT NULL COLLATE NOCASE,
	`verify_token` text NOT NULL COLLATE NOCASE,
	`batch_id` text NOT NULL,
	`issued_at` text NOT NULL,
	`draw_expires_at` text,
	`claimed_at` text,
	`claim_id` text,
	`attendee_name` text DEFAULT '' NOT NULL,
	`used_at` text,
	`revoked_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_serial_unique` ON `tickets` (`serial`);--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_draw_code_unique` ON `tickets` (`draw_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_draw_code_key_unique` ON `tickets` (`draw_code_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_verify_token_unique` ON `tickets` (`verify_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_claim_id_unique` ON `tickets` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_session_claim` ON `tickets` (`session_id`,`claimed_at`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tickets_batch` ON `tickets` (`batch_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_created_at` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `issue_requests` (
	`request_id` text PRIMARY KEY NOT NULL,
	`payload_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer NOT NULL
);
--> statement-breakpoint
PRAGMA optimize;
