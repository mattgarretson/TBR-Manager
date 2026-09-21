// Builds public/demo-library.json — the dataset ?demo=1 loads — from a real Plot Pile backup.
//
//   node scripts/build-demo-library.mjs ~/Downloads/plot-pile-backup-2026-09-19.json
//
// The demo is a backup v1 file so the app can read it with the existing parseBackup, and it
// ships in a public repo, so this script only keeps what is safe to publish: covers, titles,
// authors, series and tags. Personal "why it made the list" notes and series notes are dropped.
// Books without a cover are dropped too — the demo is a shop window, and placeholder tiles
// look unfinished. GARNISH below is invented demo-only data; delete it for a plain trim.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT = path.resolve(fileURLToPath(new URL("../public/demo-library.json", import.meta.url)));

// How many covered books to keep per series and status, picked in reading order. Standalone
// books use "". The mix is deliberate: the library opens on the "To read" shelf, so the demo
// needs to land there full, with enough finished and reading books to make the other shelves
// and the owned/to-buy split worth tapping.
const QUOTAS = {
  "He Who Fights with Monsters": { tbr: 4, reading: 1 },
  "Expeditionary Force": { tbr: 4, finished: 2 },
  Culture: { tbr: 2 },
  "The Final Architecture": { tbr: 2 },
  "Mother of Learning": { tbr: 1 },
  "Dungeon Crawler Carl": { finished: 3, reading: 1 },
  Cradle: { finished: 3 },
  "The Perfect Run": { finished: 1 },
  "Children of Time": { finished: 1 },
  "": { finished: 2 },
};

// Demo-only garnish: the real library records no release dates, so without this the Upcoming
// releases filter would render empty in the showcase. Reason notes are never invented — a demo
// book with no "why it made the list" simply shows none.
const GARNISH = {
  // Kept later than the preordered books below, so a series reads as "one in the pile, one still coming".
  seriesNextRelease: {
    "He Who Fights with Monsters": { title: "Book 13", date: "2027-03-09" },
    "Expeditionary Force": { title: "Match Game", date: "2027-05-18" },
  },
  bookReleaseDate: {
    "He Who Fights with Monsters": "2026-11-17",
    "Expeditionary Force": "2027-02-02",
  },
};

function positionOf(book) {
  const parsed = Number.parseFloat(book.seriesPosition);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/build-demo-library.mjs <path-to-backup.json>");
  process.exit(1);
}

const backup = JSON.parse(await readFile(source, "utf8"));
if (backup.app !== "Plot Pile" || backup.version !== 1) {
  throw new Error("That file is not a Plot Pile backup v1.");
}

const seriesById = new Map(backup.series.map((item) => [item.id, item]));
const seriesNameOf = (book) => (book.seriesId ? seriesById.get(book.seriesId)?.name ?? "" : "");

// Group the covered books by series name, then take each series' quota in reading order.
const grouped = new Map();
for (const book of backup.books) {
  if (!book.coverImage) continue;
  const name = seriesNameOf(book);
  if (!(name in QUOTAS)) continue;
  grouped.set(name, [...(grouped.get(name) ?? []), book]);
}

const picked = [];
for (const [name, quota] of Object.entries(QUOTAS)) {
  const available = (grouped.get(name) ?? []).sort((left, right) =>
    positionOf(left) - positionOf(right) || left.title.localeCompare(right.title));
  for (const [status, wanted] of Object.entries(quota)) {
    const matching = available.filter((book) => book.status === status);
    if (matching.length < wanted) {
      console.warn(`! ${name || "(standalone)"}: wanted ${wanted} covered ${status} books, found ${matching.length}`);
    }
    picked.push(...matching.slice(0, wanted));
  }
}
picked.sort((left, right) =>
  seriesNameOf(left).localeCompare(seriesNameOf(right))
  || positionOf(left) - positionOf(right)
  || left.title.localeCompare(right.title));

const books = picked.map((book) => {
  const name = seriesNameOf(book);
  const upcoming = book.status === "tbr" ? GARNISH.bookReleaseDate[name] : undefined;
  // Only the last book kept from a series gets the release date, so it reads as the next one out.
  const isLastOfSeries = picked.filter((item) => seriesNameOf(item) === name).at(-1)?.id === book.id;
  return {
    ...book,
    reason: "",
    releaseDate: upcoming && isLastOfSeries ? upcoming : "",
  };
});

const usedSeriesIds = new Set(books.map((book) => book.seriesId).filter(Boolean));
const series = backup.series
  .filter((item) => usedSeriesIds.has(item.id))
  .map((item) => {
    const next = item.status === "incomplete" ? GARNISH.seriesNextRelease[item.name] : undefined;
    return {
      ...item,
      notes: "",
      nextReleaseTitle: next?.title ?? "",
      nextReleaseDate: next?.date ?? "",
    };
  });

const demo = {
  app: "Plot Pile",
  version: 1,
  exportedAt: new Date().toISOString(),
  books,
  series,
};

await writeFile(OUTPUT, `${JSON.stringify(demo)}\n`);

const bytes = Buffer.byteLength(JSON.stringify(demo));
const counts = books.reduce((all, book) => ({ ...all, [book.status]: (all[book.status] ?? 0) + 1 }), {});
console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)}`);
console.log(`  ${books.length} books, ${series.length} series, ${(bytes / 1048576).toFixed(2)}MB`);
console.log(`  statuses ${JSON.stringify(counts)}, owned ${books.filter((book) => book.owned).length}`);
