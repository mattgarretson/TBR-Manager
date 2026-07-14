import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const bookSeries = sqliteTable(
  "book_series",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id").notNull(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    status: text("status").notNull().default("incomplete"),
    nextReleaseDate: text("next_release_date").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("book_series_library_id_idx").on(table.libraryId),
    uniqueIndex("book_series_library_name_key_unique").on(table.libraryId, table.nameKey),
  ],
);

export const books = sqliteTable(
  "books",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id").notNull(),
    seriesId: text("series_id").references(() => bookSeries.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    author: text("author").notNull(),
    reason: text("reason").notNull().default(""),
    tags: text("tags").notNull().default("[]"),
    coverUrl: text("cover_url").notNull().default(""),
    coverKey: text("cover_key").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("books_library_id_idx").on(table.libraryId),
    index("books_series_id_idx").on(table.seriesId),
  ],
);
