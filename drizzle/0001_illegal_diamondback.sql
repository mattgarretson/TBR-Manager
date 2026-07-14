CREATE TABLE `book_series` (
	`id` text PRIMARY KEY NOT NULL,
	`library_id` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`status` text DEFAULT 'incomplete' NOT NULL,
	`next_release_date` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `book_series_library_id_idx` ON `book_series` (`library_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `book_series_library_name_key_unique` ON `book_series` (`library_id`,`name_key`);--> statement-breakpoint
ALTER TABLE `books` ADD `series_id` text REFERENCES book_series(id);--> statement-breakpoint
CREATE INDEX `books_series_id_idx` ON `books` (`series_id`);