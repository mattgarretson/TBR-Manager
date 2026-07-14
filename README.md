# Plot Pile

Plot Pile is an offline-first, installable TBR organizer designed for phones.

## Product shape

- Books with authors, covers, notes, unlimited normalized tags, and release dates
- First-class series with complete/incomplete status, reading order, notes, and upcoming releases
- Library and series search, filters, and ascending/descending sorts
- IndexedDB as the on-device source of truth
- JSON backup and restore, including uploaded cover data
- One-time import of records saved by the earlier hosted-database version
- PWA manifest, service worker, Android install prompt, and iOS installation guidance

The existing D1 and R2 routes remain available only so an existing browser can copy its old hosted shelf into the on-device database. New edits are stored locally.

## Architecture

- `lib/library` contains the typed domain model, selectors, application service, migration adapter, and IndexedDB repository.
- `app/use-library-controller.ts` is the only React boundary that coordinates persisted library state.
- `components/library` owns the library, series, settings, and editor workflows.
- `/api/books` and `/api/covers/:key` are temporary, read-only compatibility endpoints. They are not part of normal application operation.

The version-one backup format and the `plot-pile-library` IndexedDB name are compatibility contracts. See `docs/architecture.md` and `docs/legacy-retirement.md` before changing either one.

## Development

```bash
npm install
npm run dev
npm run check
```

`npm run check` performs type checking, linting, 35 domain/storage/UI/PWA tests, and a production build.
