CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`cover_url` text DEFAULT '' NOT NULL,
	`cover_key` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `books_library_id_idx` ON `books` (`library_id`);