# Plot Pile

Plot Pile is an offline-first, installable TBR organizer designed for phones.

## Product shape

- Books with authors, covers, notes, unlimited normalized tags, release dates, and a read lifecycle (to read / reading / finished / didn't finish)
- Cover search and offline download from Open Library
- First-class series with default authors, inherited tags, ongoing/finished publishing status, reading order, notes, and upcoming releases
- Batch series creation for numbered runs or pasted individual titles, with an editable preview
- Android share target and "Add from links" batch import for clearing out open tabs
- Library and series search, filters, and ascending/descending sorts
- Tag manager, duplicate warnings, undo for book removal, backup reminders, six color themes (two dark)
- IndexedDB as the on-device source of truth
- JSON backup and restore, including localized cover data
- PWA manifest, service worker, Android install prompt, and iOS installation guidance

There is no server. Each browser keeps its own library; moving to a new device or a new site address is done with a backup download and restore.

## Architecture

- `lib/library` contains the typed domain model, selectors, application service, and IndexedDB repository.
- `app/use-library-controller.ts` is the only React boundary that coordinates persisted library state.
- `components/library` owns the library, series, settings, and editor workflows.
- `src/main.tsx` + `index.html` are the Vite entry point.

The version-one backup format and the `plot-pile-library` IndexedDB name are compatibility contracts. See `docs/architecture.md` before changing either one.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run check    # typecheck, lint, tests, production build
```

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which runs `npm run check` and publishes `dist/` to GitHub Pages. The build uses relative URLs, so it works under a project path (`/TBR-Manager/`) or at a domain root.
