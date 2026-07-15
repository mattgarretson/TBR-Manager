import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlotPileApp } from "../app/page";
import { LibraryService } from "../lib/library/service";
import { MemoryLibraryRepository } from "./helpers/memory-repository";
import { snapshot, timestamp } from "./fixtures/library";

function renderApp(initial = snapshot) {
  const repository = new MemoryLibraryRepository(initial);
  let generatedId = 0;
  const service = new LibraryService(repository, {
    now: () => new Date(timestamp),
    createId: () => `created-id-${generatedId++}`,
  });
  const migrate = vi.fn().mockResolvedValue({ importedBooks: 0, localizedCovers: 0, pendingCovers: 0 });
  render(<PlotPileApp controllerDependencies={{ repository, service, migrate }} />);
  return { repository, service, migrate };
}

describe("Plot Pile behavior", () => {
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
});
