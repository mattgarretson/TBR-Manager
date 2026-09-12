import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlotPileApp } from "../app/page";
import type { CoverSearchClient } from "../components/library/cover-search";
import {
  LIBRARY_VIEW_PREFERENCES_KEY,
  SERIES_VIEW_PREFERENCES_KEY,
} from "../components/library/view-preferences";
import { LibraryService } from "../lib/library/service";
import { MemoryLibraryRepository } from "./helpers/memory-repository";
import { book, snapshot, timestamp } from "./fixtures/library";

function renderApp(initial = snapshot, coverClient?: CoverSearchClient, bookRemovalUndoMs?: number) {
  const repository = new MemoryLibraryRepository(initial);
  return renderAppWithRepository(repository, coverClient, bookRemovalUndoMs);
}

function renderAppWithRepository(
  repository: MemoryLibraryRepository,
  coverClient?: CoverSearchClient,
  bookRemovalUndoMs?: number,
) {
  let generatedId = 0;
  const service = new LibraryService(repository, {
    now: () => new Date(timestamp),
    createId: () => `created-id-${generatedId++}`,
  });
  const rendered = render(
    <PlotPileApp
      controllerDependencies={{ repository, service, bookRemovalUndoMs }}
      coverClient={coverClient}
    />,
  );
  return { repository, service, ...rendered };
}

describe("Plot Pile behavior", () => {
  it("opens a shared book after loading and strips the launch parameters", async () => {
    const user = userEvent.setup();
    const repository = new MemoryLibraryRepository({ books: [], series: [] });
    const service = new LibraryService(repository, {
      now: () => new Date(timestamp),
      createId: () => "shared-book",
    });
    let finishLoading: (() => void) | undefined;
    vi.spyOn(service, "read").mockImplementationOnce(() => new Promise((resolve) => {
      finishLoading = () => resolve(repository.snapshot);
    }));
    const params = new URLSearchParams({
      title: "A Psalm for the Wild-Built by Becky Chambers | Goodreads",
      url: "https://www.goodreads.com/book/show/40864002-a-psalm-for-the-wild-built",
    });
    window.history.pushState({}, "", `/?${params}`);

    render(<PlotPileApp controllerDependencies={{ repository, service }} />);

    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => {
      finishLoading?.();
    });

    expect((await screen.findByRole("textbox", { name: "Book title" }) as HTMLInputElement).value)
      .toBe("A Psalm for the Wild-Built");
    expect((screen.getByRole("textbox", { name: "Author" }) as HTMLInputElement).value)
      .toBe("Becky Chambers");
    expect((screen.getByRole("textbox", { name: "Where I found it" }) as HTMLInputElement).value)
      .toBe("https://www.goodreads.com/book/show/40864002-a-psalm-for-the-wild-built");
    expect(window.location.search).toBe("");

    await user.click(screen.getByRole("button", { name: "Add to my TBR" }));
    await waitFor(() => expect(repository.snapshot.books[0].sourceUrl)
      .toBe("https://www.goodreads.com/book/show/40864002-a-psalm-for-the-wild-built"));
    expect(screen.getByRole("link", { name: "Open where A Psalm for the Wild-Built was found" })).toBeTruthy();
  });

  it("routes a share containing several links into the batch preview", async () => {
    const sharedText = [
      "Book One by A. Writer | Goodreads",
      "https://www.goodreads.com/book/show/123-book-one",
      "New Book by New Writer - Amazon.com",
      "https://www.amazon.com/New-Book-New-Writer/dp/B000000001",
    ].join("\n");
    window.history.pushState({}, "", `/?text=${encodeURIComponent(sharedText)}`);

    renderApp();

    expect(await screen.findByRole("heading", { name: "Add from links" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "New book" })).toBeNull();
    expect(screen.getByLabelText("Books from links").textContent).toContain("2 links found");
    expect(window.location.search).toBe("");
  });

  it("pastes, previews, edits, and atomically saves selected link drafts", async () => {
    const user = userEvent.setup();
    const { repository } = renderApp();
    await screen.findByText("Book One");
    await user.click(screen.getByRole("button", { name: "Add from links" }));
    const links = screen.getByRole("textbox", { name: "Links to books" });
    const pasted = [
      "Book One by A. Writer | Goodreads",
      "https://www.goodreads.com/book/show/123-book-one",
      "New Book by New Writer - Amazon.com",
      "https://www.amazon.com/New-Book-New-Writer/dp/B000000001",
      "https://www.amazon.com/New-Book-New-Writer/dp/B000000001",
    ].join("\n");
    await user.click(links);
    await user.paste(pasted);
    await user.click(screen.getByRole("button", { name: "Preview links" }));

    expect(screen.getByLabelText("Books from links").textContent).toContain("2 links found");
    expect(screen.getByText("Already in library: Book One by A. Writer")).toBeTruthy();
    const duplicateChoice = screen.getByRole("checkbox", { name: "Include Book One" }) as HTMLInputElement;
    expect(duplicateChoice.checked).toBe(false);

    const firstTitle = screen.getByRole("textbox", { name: "Title for link 1" });
    await user.clear(firstTitle);
    await user.type(firstTitle, "Book One Revised");
    await user.click(duplicateChoice);
    await user.click(screen.getByRole("button", { name: "Save 2 books" }));

    await waitFor(() => expect(repository.snapshot.books).toHaveLength(3));
    expect(repository.snapshot.books).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "Book One Revised",
        author: "A. Writer",
        sourceUrl: "https://www.goodreads.com/book/show/123-book-one",
        seriesId: null,
        status: "tbr",
        coverImage: "",
      }),
      expect.objectContaining({
        title: "New Book",
        author: "New Writer",
        sourceUrl: "https://www.amazon.com/New-Book-New-Writer/dp/B000000001",
        seriesId: null,
        status: "tbr",
        coverImage: "",
      }),
    ]));
  });

  it("navigates between the complete mobile information architecture", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(await screen.findByRole("heading", { name: "My TBR" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Series" }));
    expect(screen.getByRole("heading", { name: "Series", level: 1 })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("heading", { name: "More" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Bookshop/ }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: /^Forest/ }));
    expect(document.documentElement.dataset.theme).toBe("forest");
  });

  it("shows the backup nudge for stale metadata, hides fresh or snoozed states, and records dismissal", async () => {
    const manyBooks = {
      ...snapshot,
      books: Array.from({ length: 5 }, (_, index) => ({
        ...book,
        id: `book-${index + 1}`,
        title: `Book ${index + 1}`,
      })),
    };

    const freshRepository = new MemoryLibraryRepository(manyBooks);
    freshRepository.metadata.set("last-backup-at", "2026-12-15T12:00:00.000Z");
    const freshApp = renderAppWithRepository(freshRepository);
    await screen.findByRole("heading", { name: "My TBR" });
    expect(screen.queryByText("It’s been a while since your last backup")).toBeNull();
    freshApp.unmount();

    const staleRepository = new MemoryLibraryRepository(manyBooks);
    staleRepository.metadata.set("last-backup-at", "2026-11-01T12:00:00.000Z");
    const staleApp = renderAppWithRepository(staleRepository);
    expect(await screen.findByText("It’s been a while since your last backup")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss backup reminder" }));
    await waitFor(() => expect(staleRepository.metadata.get("backup-nudge-snoozed-until")).toBe("2027-01-08"));
    staleApp.unmount();

    const snoozedRepository = new MemoryLibraryRepository(manyBooks);
    snoozedRepository.metadata.set("last-backup-at", "2026-11-01T12:00:00.000Z");
    snoozedRepository.metadata.set("backup-nudge-snoozed-until", "2027-01-08");
    renderAppWithRepository(snoozedRepository);
    await screen.findByRole("heading", { name: "My TBR" });
    expect(screen.queryByText("It’s been a while since your last backup")).toBeNull();
  });

  it("filters books by tag and clears the active filter", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText("Book One");
    const tagButtons = screen.getAllByRole("button", { name: /slow burn/i });
    await user.click(tagButtons[0]);
    expect(tagButtons[0].getAttribute("aria-pressed")).toBe("true");
    await user.click(tagButtons[0]);
    expect(tagButtons[0].getAttribute("aria-pressed")).toBe("false");
  });

  it("defers decoding and loading library cover images", async () => {
    renderApp();
    const cover = await screen.findByRole("img", { name: "Cover of Book One" });
    expect(cover.getAttribute("loading")).toBe("lazy");
    expect(cover.getAttribute("decoding")).toBe("async");
  });

  it("restores valid library and series view preferences without persisting search or tags", async () => {
    localStorage.setItem(LIBRARY_VIEW_PREFERENCES_KEY, JSON.stringify({
      shelf: "reading",
      scope: "complete",
      sort: "title",
      direction: "asc",
      query: "must not restore",
      activeTag: "slow burn",
    }));
    localStorage.setItem(SERIES_VIEW_PREFERENCES_KEY, JSON.stringify({
      scope: "upcoming",
      sort: "books",
      direction: "desc",
      query: "must not restore",
    }));
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "My TBR" });

    expect(screen.getByRole("button", { name: "Reading" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Finished series" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", { name: "Sort books by" }) as HTMLSelectElement).value).toBe("title");
    expect((screen.getByRole("searchbox", { name: "Search books" }) as HTMLInputElement).value).toBe("");

    await user.click(screen.getByRole("button", { name: "Series" }));
    expect(screen.getByRole("button", { name: /Upcoming/ }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", { name: "Sort series by" }) as HTMLSelectElement).value).toBe("books");
    expect((screen.getByRole("searchbox", { name: "Search series and linked books" }) as HTMLInputElement).value).toBe("");
  });

  it("falls back to current defaults for invalid stored view preferences", async () => {
    localStorage.setItem(LIBRARY_VIEW_PREFERENCES_KEY, JSON.stringify({
      shelf: "paused",
      scope: "everything",
      sort: "rating",
      direction: "sideways",
    }));
    localStorage.setItem(SERIES_VIEW_PREFERENCES_KEY, "{not json");
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "My TBR" });
    expect(screen.getByRole("button", { name: "To read" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", { name: "Sort books by" }) as HTMLSelectElement).value).toBe("createdAt");

    await user.click(screen.getByRole("button", { name: "Series" }));
    expect((screen.getByRole("combobox", { name: "Sort series by" }) as HTMLSelectElement).value).toBe("name");
    expect(screen.getByRole("button", { name: "Sort descending" }).textContent).toContain("Asc");
  });

  it("clear filters restores and stores every library view default", async () => {
    localStorage.setItem(LIBRARY_VIEW_PREFERENCES_KEY, JSON.stringify({
      shelf: "all",
      scope: "complete",
      sort: "title",
      direction: "asc",
    }));
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("heading", { name: "My TBR" });
    await user.type(screen.getByRole("searchbox", { name: "Search books" }), "no such book");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("button", { name: "To read" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("button", { name: "All" }).filter(
      (element) => element.getAttribute("aria-pressed") === "true",
    )).toHaveLength(1);
    expect((screen.getByRole("combobox", { name: "Sort books by" }) as HTMLSelectElement).value).toBe("createdAt");
    expect(screen.getByRole("button", { name: "Sort ascending" }).textContent).toContain("Desc");
    await waitFor(() => expect(JSON.parse(localStorage.getItem(LIBRARY_VIEW_PREFERENCES_KEY) ?? "{}")).toEqual({
      shelf: "tbr",
      scope: "all",
      sort: "createdAt",
      direction: "desc",
    }));
  });

  it("moves a card from to read to reading to finished and stamps the date", async () => {
    const user = userEvent.setup();
    const { repository } = renderApp();
    await screen.findByText("Book One");

    await user.click(screen.getByRole("button", { name: "Start reading" }));
    await waitFor(() => expect(repository.snapshot.books[0].status).toBe("reading"));

    await user.click(screen.getByRole("button", { name: "Reading" }));
    await user.click(await screen.findByRole("button", { name: "Finished" }));
    await waitFor(() => expect(repository.snapshot.books[0]).toMatchObject({
      status: "finished",
      finishedDate: "2027-01-01",
    }));

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText("Book One")).toBeTruthy();
    expect(screen.getByText("Finished", { selector: ".book-status-badge" })).toBeTruthy();
  });

  it("shows inherited series tags on books and filters by them", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText("Book One");
    const tagButtons = screen.getAllByRole("button", { name: /fantasy/i });
    expect(tagButtons).toHaveLength(2);
    await user.click(tagButtons[0]);
    expect(screen.getByText("Book One")).toBeTruthy();
    expect(tagButtons[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("adds a series tag once and exposes it on every linked book", async () => {
    const user = userEvent.setup();
    const { repository } = renderApp();
    await screen.findByText("Book One");
    await user.click(screen.getByRole("button", { name: "Series" }));
    await user.click(screen.getByRole("button", { name: "Edit series" }));
    await user.type(screen.getByRole("textbox", { name: "Add series tags" }), "progression{enter}");
    await user.click(screen.getByRole("button", { name: "Save series" }));
    await waitFor(() => expect(repository.snapshot.series[0].tags).toEqual(["fantasy", "progression"]));
    await user.click(screen.getByRole("button", { name: "Library" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /progression/i })).toHaveLength(2));
  });

  it("adds a current library tag from editor autocomplete", async () => {
    const user = userEvent.setup();
    const { repository } = renderApp();
    await screen.findByText("Book One");
    await user.click(screen.getByRole("button", { name: "Add book" }));
    await user.type(screen.getByRole("textbox", { name: "Book title" }), "Another Book");
    await user.type(screen.getByRole("textbox", { name: "Author" }), "Another Writer");
    await user.click(screen.getByText("More details"));
    await user.type(screen.getByRole("textbox", { name: "Add book-specific tags" }), "fan");
    await user.click(screen.getByRole("button", { name: "Use tag fantasy" }));
    expect(screen.getByRole("button", { name: "Remove fantasy" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add to my TBR" }));
    await waitFor(() => expect(repository.snapshot.books).toHaveLength(2));
    expect(repository.snapshot.books.find((item) => item.title === "Another Book")?.tags).toEqual(["fantasy"]);
  });

  it("renames and deletes stored tags from Settings through the confirmation flow", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { repository } = renderApp({
      ...snapshot,
      books: [{ ...book, tags: ["slow burn", "fantasy"] }],
    });
    await screen.findByText("Book One");
    await user.click(screen.getByRole("button", { name: "More" }));

    await user.click(screen.getByRole("button", { name: "Rename slow burn" }));
    const tagName = screen.getByRole("textbox", { name: "New name for slow burn" });
    await user.clear(tagName);
    await user.type(tagName, " #FANTASY ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(repository.snapshot.books[0].tags).toEqual(["fantasy"]));
    await user.click(screen.getByRole("button", { name: "Delete fantasy" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toContain("fantasy");
    await waitFor(() => expect(repository.snapshot.books[0].tags).toEqual([]));
    expect(repository.snapshot.series[0].tags).toEqual([]);
  });

  it("edits a book through the controller and validates required fields", async () => {
    const user = userEvent.setup();
    const { repository } = renderApp();
    await screen.findByText("Book One");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const title = screen.getByRole("textbox", { name: "Book title" });
    await user.clear(title);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Add both a title and an author");
    await user.type(title, "Updated Book");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(repository.snapshot.books[0].title).toBe("Updated Book"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("warns about a matching title and author but allows an explicit duplicate save", async () => {
    const user = userEvent.setup();
    const { repository } = renderApp();
    await screen.findByText("Book One");
    await user.click(screen.getByRole("button", { name: "Add book" }));
    await user.type(screen.getByRole("textbox", { name: "Book title" }), " book one ");
    await user.type(screen.getByRole("textbox", { name: "Author" }), "A. WRITER");
    await user.click(screen.getByRole("button", { name: "Add to my TBR" }));

    expect(await screen.findByText(/already matches “Book One”/)).toBeTruthy();
    expect(repository.snapshot.books).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(repository.snapshot.books).toHaveLength(2));
  });

  it("removes a book immediately and restores the exact record from the undo toast", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    const { repository } = renderApp();
    await screen.findByText("Book One");

    await user.click(screen.getByRole("button", { name: "Remove book" }));
    await waitFor(() => expect(repository.snapshot.books).toEqual([]));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByText(/Removed “Book One”/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(repository.snapshot.books).toEqual(snapshot.books));
  });

  it("expires the undo and keeps the removed book absent after a reload", async () => {
    const user = userEvent.setup();
    const { repository, unmount } = renderApp(snapshot, undefined, 1);
    await screen.findByText("Book One");
    await user.click(screen.getByRole("button", { name: "Remove book" }));
    await waitFor(() => expect(repository.snapshot.books).toEqual([]));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo" })).toBeNull());

    unmount();
    renderAppWithRepository(repository);
    expect(await screen.findByRole("heading", { name: "My TBR" })).toBeTruthy();
    expect(screen.queryByText("Book One")).toBeNull();
  });

  it("finds, localizes, previews, and saves a cover from an injected online client", async () => {
    const user = userEvent.setup();
    const coverClient: CoverSearchClient = {
      searchCovers: vi.fn().mockResolvedValue([
        { coverId: 42, title: "Unsouled", author: "Will Wight", year: 2016 },
      ]),
      coverImageUrl: vi.fn((coverId, size) => `https://covers.example/${coverId}-${size}.jpg`),
      fetchCoverDataUrl: vi.fn().mockResolvedValue("data:image/jpeg;base64,Y292ZXI="),
    };
    const { repository } = renderApp({ books: [], series: [] }, coverClient);
    await screen.findByRole("heading", { name: "My TBR" });
    await user.click(screen.getByRole("button", { name: /Add your first book/ }));
    await user.type(screen.getByRole("textbox", { name: "Book title" }), "Unsouled");
    await user.type(screen.getByRole("textbox", { name: "Author" }), "Will Wight");
    await user.click(screen.getByText("More details"));
    await user.click(screen.getByRole("button", { name: "Find cover online" }));

    await user.click(await screen.findByRole("button", { name: "Use cover for Unsouled" }));

    const preview = await screen.findByRole("img", { name: "Selected cover preview" });
    expect(preview.getAttribute("src")).toBe("data:image/jpeg;base64,Y292ZXI=");
    expect(coverClient.searchCovers).toHaveBeenCalledWith({ title: "Unsouled", author: "Will Wight" });
    expect(coverClient.fetchCoverDataUrl).toHaveBeenCalledWith(42);
    await user.click(screen.getByRole("button", { name: "Add to my TBR" }));
    await waitFor(() => expect(repository.snapshot.books).toHaveLength(1));
    expect(repository.snapshot.books[0].coverImage).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("protects dirty editor changes from accidental dismissal", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText("Book One");
    const editButton = screen.getByRole("button", { name: "Edit" });
    await user.click(editButton);
    await user.type(screen.getByRole("textbox", { name: "Book title" }), " changed");
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(editButton));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("creates a series with an editable batch of inherited-author books", async () => {
    const user = userEvent.setup();
    const { repository } = renderApp({ books: [], series: [] });
    await screen.findByRole("heading", { name: "My TBR" });
    await user.click(screen.getByRole("button", { name: "Series" }));
    await user.click(screen.getByRole("button", { name: "New series" }));
    await user.type(screen.getByRole("textbox", { name: "Series name" }), "He Who Fights With Monsters");
    await user.type(screen.getByRole("textbox", { name: "Series author" }), "Shirtaloon");
    await user.click(screen.getByRole("radio", { name: /Numbered titles/ }));
    await user.type(screen.getByRole("textbox", { name: "Book title" }), "He Who Fights With Monsters");
    const count = screen.getByRole("spinbutton", { name: "How many?" });
    await user.clear(count);
    await user.type(count, "3");
    await user.click(screen.getByRole("button", { name: "Preview books" }));
    const secondTitle = screen.getByRole("textbox", { name: "Title for book 2" });
    await user.clear(secondTitle);
    await user.type(secondTitle, "A Fancy Exception");
    await user.click(screen.getByRole("button", { name: "Create series + 3" }));
    await waitFor(() => expect(repository.snapshot.books).toHaveLength(3));
    expect(repository.snapshot.series[0]).toMatchObject({ author: "Shirtaloon" });
    expect(repository.snapshot.books).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "He Who Fights With Monsters 1", author: "Shirtaloon", seriesPosition: "1" }),
      expect.objectContaining({ title: "A Fancy Exception", author: "Shirtaloon", seriesPosition: "2" }),
    ]));
  });

  it("turns a pasted reading-order list into individually titled books", async () => {
    const user = userEvent.setup();
    const { repository } = renderApp({ books: [], series: [] });
    await screen.findByRole("heading", { name: "My TBR" });
    await user.click(screen.getByRole("button", { name: "Series" }));
    await user.click(screen.getByRole("button", { name: "New series" }));
    await user.type(screen.getByRole("textbox", { name: "Series name" }), "Cradle");
    await user.type(screen.getByRole("textbox", { name: "Series author" }), "Will Wight");
    await user.click(screen.getByRole("radio", { name: /Individual titles/ }));
    await user.type(screen.getByRole("textbox", { name: /Book titles/ }), "1. Unsouled{enter}2 | Soulsmith");
    await user.click(screen.getByRole("button", { name: "Preview books" }));
    await user.click(screen.getByRole("button", { name: "Create series + 2" }));
    await waitFor(() => expect(repository.snapshot.books).toHaveLength(2));
    expect(repository.snapshot.books).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Unsouled", seriesPosition: "1", author: "Will Wight" }),
      expect.objectContaining({ title: "Soulsmith", seriesPosition: "2", author: "Will Wight" }),
    ]));
  });

  it("prefills the series author and next position, then stays open to add another", async () => {
    const user = userEvent.setup();
    const { repository } = renderApp();
    await screen.findByText("Book One");
    await user.click(screen.getByRole("button", { name: "Series" }));
    await user.click(screen.getByRole("button", { name: "Add next book" }));
    expect((screen.getByRole("textbox", { name: "Author" }) as HTMLInputElement).value).toBe("A. Writer");
    expect((screen.getByRole("textbox", { name: "Position in series" }) as HTMLInputElement).value).toBe("2");
    await user.type(screen.getByRole("textbox", { name: "Book title" }), "Book Two");
    await user.click(screen.getByRole("button", { name: "Save & add another" }));
    await waitFor(() => expect(repository.snapshot.books).toHaveLength(2));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Book title" }) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("textbox", { name: "Author" }) as HTMLInputElement).value).toBe("A. Writer");
    expect((screen.getByRole("textbox", { name: "Position in series" }) as HTMLInputElement).value).toBe("3");
  });

  it("does not offer another book for a completed series", async () => {
    const user = userEvent.setup();
    renderApp({
      ...snapshot,
      series: snapshot.series.map((item) => ({ ...item, status: "complete" as const })),
    });
    await screen.findByText("Book One");
    await user.click(screen.getByRole("button", { name: "Series" }));
    expect(screen.queryByRole("button", { name: "Add next book" })).toBeNull();
  });
});
