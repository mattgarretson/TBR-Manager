import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const books = sqliteTable(
  "books",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull(),
    reason: text("reason").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    coverUrl: text("cover_url").notNull().default(""),
    coverKey: text("cover_key").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("books_library_id_idx").on(table.libraryId)],
);
