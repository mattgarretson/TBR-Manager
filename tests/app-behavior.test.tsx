import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlotPileApp } from "../app/page";
import { LibraryService } from "../lib/library/service";
import { MemoryLibraryRepository } from "./helpers/memory-repository";
import { snapshot, timestamp } from "./fixtures/library";

function renderApp(initial = snapshot) {
  const repository = new MemoryLibraryRepository(initial);
  const service = new LibraryService(repository, {
    now: () => new Date(timestamp),
    createId: () => "created-id",
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
});
