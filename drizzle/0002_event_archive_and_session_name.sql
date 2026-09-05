ALTER TABLE `events` ADD COLUMN `deleted_at` text;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `name` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `sessions` SET `name` = `code` WHERE `name` = '';
--> statement-breakpoint
CREATE TABLE `checkin_records` (
	`id` text PRIMARY KEY NOT NULL,
	`source_ticket_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_code` text NOT NULL,
	`event_name` text NOT NULL,
	`session_id` text NOT NULL,
	`session_code` text NOT NULL,
	`session_name` text NOT NULL,
	`event_date` text NOT NULL,
	`start_time` text NOT NULL,
	`venue` text NOT NULL DEFAULT '',
	`ticket_serial` text NOT NULL,
	`pass_type` text NOT NULL,
	`rarity` text NOT NULL,
	`zone` text NOT NULL,
	`attendee_name` text NOT NULL DEFAULT '',
	`final_status` text NOT NULL CHECK (`final_status` IN ('USED','REVOKED')),
	`checked_in_at` text NOT NULL,
	`archived_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkin_records_source_ticket_unique` ON `checkin_records` (`source_ticket_id`);
--> statement-breakpoint
CREATE INDEX `idx_checkin_records_checked_in` ON `checkin_records` (`checked_in_at` DESC);
--> statement-breakpoint
CREATE INDEX `idx_events_visible` ON `events` (`deleted_at`,`updated_at`);
--> statement-breakpoint
PRAGMA optimize;
