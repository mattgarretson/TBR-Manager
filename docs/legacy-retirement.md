# Legacy D1/R2 retirement

The compatibility window starts with the release that makes the old routes read-only and localizes R2 covers. Do not remove the bindings merely because normal application operation no longer uses them.

## Current stage: read-only migration

- `/api/books` exposes `GET` only and accepts only version-4 UUID library IDs created by the old client.
- `/api/covers/:key` exposes `GET` only.
- Anonymous book writes and cover uploads have been removed.
- Data import and cover localization use separate IndexedDB metadata. Failed cover copies remain retryable and are reported in Settings.

## Removal gates

All gates are required:

1. At least two published application releases have included the lossless importer.
2. At least 60 days have elapsed since the first of those releases.
3. A final production build and migration smoke test pass against a copy of representative legacy data.
4. D1 rows and referenced R2 objects are exported through the Sites control plane and the export has a named owner and deletion date.

## Retirement release

After the gates pass:

1. Remove the legacy initialization call and migration status UI.
2. Remove `/api/books`, `/api/covers/:key`, `db`, Drizzle configuration/migrations, legacy response mapping, and legacy-only tests.
3. Remove `d1` and `r2` from `.openai/hosting.json`, then remove Drizzle dependencies and regenerate the lockfile.
4. Remove unused starter authentication/examples and Cloudflare binding declarations.
5. Verify the production build contains only the application route and that a version-one backup still round-trips.
6. Keep the exported cloud data for 30 additional days before deleting it.

The retirement release is intentionally not part of the initial refactor deployment: removing the live bindings before the time gates would violate the recovery guarantee for inactive users.

