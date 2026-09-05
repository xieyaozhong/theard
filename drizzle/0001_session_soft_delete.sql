ALTER TABLE `sessions` ADD COLUMN `deleted_at` text;
--> statement-breakpoint
CREATE INDEX `idx_sessions_visible_date` ON `sessions` (`deleted_at`,`event_date`,`start_time`);
--> statement-breakpoint
PRAGMA optimize;
