# Plot Pile architecture

Plot Pile is a single-user, device-local application. IndexedDB is the authoritative data store; the Cloudflare D1 and R2 bindings exist only for a time-limited migration from the previous hosted version.

## Boundaries

1. `lib/library/model.ts` and `selectors.ts` contain pure domain rules. They do not access React, browser storage, the network, or Cloudflare bindings.
2. `LibraryRepository` defines the persistence contract. `IndexedDbLibraryRepository` is the production implementation and keeps the database name and stored record shape compatible with the original offline release.
3. `LibraryService` constructs and validates persisted entities. It owns IDs, timestamps, backup validation, and compound commands.
4. `useLibraryController` initializes migration, exposes command state to React, and translates storage errors into recoverable user messages.
5. Feature components own view filters and editor drafts. They communicate through typed controller commands rather than importing IndexedDB helpers.

## Data invariants

- Book and series IDs are stable strings.
- Series names use one normalized, English-locale case-insensitive key.
- Creating a new series from the book editor writes the series and book in one IndexedDB transaction.
- Creating a series with a batch of books writes the series and every generated book in one IndexedDB transaction.
- A series author is a default copied onto new books; each book keeps its own author so exceptions and later unlinking remain safe.
- Deleting a series and unlinking its books is one transaction.
- Release dates are empty or valid `YYYY-MM-DD` calendar dates.
- Backup version 1 remains readable and writable. Older backups without a series author infer it when every linked book has the same author. Duplicate IDs/name keys and impossible dates are rejected before replacing the current library.
- Hosted R2 cover URLs are not considered migrated until their bytes have been copied into the local `coverImage` representation.

## Change rules

- Add a domain test before changing normalization, sorting, filtering, release-date, or backup behavior.
- Add a repository test before changing an IndexedDB transaction or schema version.
- Never rename `plot-pile-library` or increment its schema version without an upgrade fixture covering an existing database.
- Keep ordinary app startup free of D1/R2 requests. Only a device with the old local library UUID or a pending hosted cover may use the compatibility routes.
- Run `npm run check` before each refactoring commit.
