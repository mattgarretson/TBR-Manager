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

## Development

```bash
npm install
npm run dev
npm test
npm run lint
```

`npm test` performs a production build and runs the data-model and PWA contract tests.
