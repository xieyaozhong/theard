ALTER TABLE `sessions` ADD `deleted_at` text;
--> statement-breakpoint
CREATE INDEX `idx_sessions_visible_date` ON `sessions` (`deleted_at`,`event_date`,`start_time`);
--> statement-breakpoint
CREATE TRIGGER `block_ticket_insert_deleted_session`
BEFORE INSERT ON `tickets`
FOR EACH ROW
WHEN EXISTS (
	SELECT 1 FROM `sessions`
	WHERE `id` = NEW.`session_id` AND `deleted_at` IS NOT NULL
)
BEGIN
	SELECT RAISE(ABORT, 'SESSION_DELETED');
END;
--> statement-breakpoint
PRAGMA optimize;
