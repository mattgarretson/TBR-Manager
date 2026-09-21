# Plot Pile architecture

Plot Pile is a single-user, device-local application served as static files. IndexedDB is the authoritative data store; there is no application server.

## Boundaries

1. `lib/library/model.ts` and `selectors.ts` contain pure domain rules. They do not access React, browser storage, or the network.
2. `LibraryRepository` defines the persistence contract. `IndexedDbLibraryRepository` is the production implementation and keeps the database name and stored record shape compatible with the original offline release.
3. `LibraryService` constructs and validates persisted entities. It owns IDs, timestamps, backup validation, and compound commands.
4. `useLibraryController` loads the library, exposes command state to React, and translates storage errors into recoverable user messages.
5. Feature components own view filters and editor drafts. They communicate through typed controller commands rather than importing IndexedDB helpers.
6. `lib/covers` is a network-only client for cover search and download. Components receive it through props, and it never reads or writes IndexedDB.

Open Library cover search (using only title and author) and the selected cover download are the app's only runtime network use. Fonts are bundled, not fetched from a CDN.

## Data invariants

- Book and series IDs are stable strings.
- Series names use one normalized, English-locale case-insensitive key.
- Creating a new series from the book editor writes the series and book in one IndexedDB transaction.
- Creating a series with a batch of books writes the series and every generated book in one IndexedDB transaction.
- A series author is a default copied onto new books; each book keeps its own author so exceptions and later unlinking remain safe.
- Series tags are inherited at read time by every linked book and participate in book search, filters, and tag counts. Book-specific tags remain independently editable.
- Saving a book drops any stored tag its series already provides, so a book's own tags never silently duplicate inherited ones.
- Deleting a series and unlinking its books is one transaction; inherited series tags are copied to the unlinked books so their classification is not lost.
- Release dates are empty or valid `YYYY-MM-DD` calendar dates.
- Backup version 1 remains readable and writable. Older backups without a series author infer it when every linked book has the same author. Duplicate IDs/name keys and impossible dates are rejected before replacing the current library.

## Hosting

- IndexedDB is bound to the site origin. Changing the hosting address means every user must download a backup on the old address and restore it on the new one — treat the production URL as stable.
- All URLs in `index.html`, `public/manifest.webmanifest`, and `public/sw.js` are relative so the build runs under a sub-path. The service worker only handles requests inside its own scope. Each build stamps the worker with a content hash and its file list, so a deploy precaches the full app under a new cache name and removes the previous build's cache.

- `?demo=1` mounts the app against an in-memory repository seeded from `public/demo-library.json`, so demo mode must never open IndexedDB. Anything published there is public: no personal reason or note text, and no books without covers.

## Change rules

- Add a domain test before changing normalization, sorting, filtering, release-date, or backup behavior.
- Add a repository test before changing an IndexedDB transaction or schema version.
- Never rename `plot-pile-library` or increment its schema version without an upgrade fixture covering an existing database.
- Regenerate `public/demo-library.json` with `scripts/build-demo-library.mjs`; never hand-edit it, and never commit personal notes or uncovered books into it.
- Run `npm run check` before each commit.
