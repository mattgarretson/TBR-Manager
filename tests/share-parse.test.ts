import { describe, expect, it } from "vitest";
import { extractUrls, parseSharedBook, parseSharedLinks } from "../lib/share/parse";

describe("shared book parsing", () => {
  it("prefers a Goodreads share title over its URL slug", () => {
    expect(parseSharedBook({
      title: "The Left Hand of Darkness by Ursula K. Le Guin | Goodreads",
      url: "https://www.goodreads.com/book/show/18423-a-different-slug",
    })).toEqual({
      title: "The Left Hand of Darkness",
      author: "Ursula K. Le Guin",
      sourceUrl: "https://www.goodreads.com/book/show/18423-a-different-slug",
    });
  });

  it("parses an Amazon share title without discarding its subtitle", () => {
    expect(parseSharedBook({
      title: "The Long Way to a Small, Angry Planet by Becky Chambers - Amazon.com",
      url: "https://www.amazon.com/dp/B00ZP64F28",
    })).toEqual({
      title: "The Long Way to a Small, Angry Planet",
      author: "Becky Chambers",
      sourceUrl: "https://www.amazon.com/dp/B00ZP64F28",
    });
  });

  it("falls back to known Goodreads, Amazon, and StoryGraph slugs", () => {
    expect(parseSharedBook({
      text: "https://www.goodreads.com/book/show/54493401-project-hail-mary?from_search=true",
    }).title).toBe("Project Hail Mary");
    expect(parseSharedBook({
      url: "https://www.amazon.com/Project-Hail-Mary-Andy-Weir/dp/B08FHBV4ZX/",
    })).toMatchObject({ title: "Project Hail Mary Andy Weir", author: "" });
    expect(parseSharedBook({
      url: "https://app.thestorygraph.com/books/the-space-between-worlds",
    }).title).toBe("The Space Between Worlds");
  });

  it("keeps TikTok links without inventing book details", () => {
    expect(parseSharedBook({
      text: "You have to read this! https://www.tiktok.com/t/ZT8abc123/",
    })).toEqual({
      title: "",
      author: "",
      sourceUrl: "https://www.tiktok.com/t/ZT8abc123/",
    });
  });

  it("returns an empty draft for junk text", () => {
    expect(parseSharedBook({ text: "This book was incredible!!!" })).toEqual({
      title: "",
      author: "",
      sourceUrl: "",
    });
  });

  it("extracts and parses multiple URLs while de-duplicating identical links", () => {
    const value = [
      "Book One by A. Writer | Goodreads",
      "https://www.goodreads.com/book/show/123-book-one",
      "A TikTok recommendation: https://www.tiktok.com/t/ZT8abc123/.",
      "Duplicate: https://www.goodreads.com/book/show/123-book-one",
    ].join("\n");

    expect(extractUrls(value)).toEqual([
      "https://www.goodreads.com/book/show/123-book-one",
      "https://www.tiktok.com/t/ZT8abc123/",
    ]);
    expect(parseSharedLinks(value)).toEqual([
      {
        title: "Book One",
        author: "A. Writer",
        sourceUrl: "https://www.goodreads.com/book/show/123-book-one",
      },
      {
        title: "",
        author: "",
        sourceUrl: "https://www.tiktok.com/t/ZT8abc123/",
      },
    ]);
  });
});
