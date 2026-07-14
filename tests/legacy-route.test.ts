import { describe, expect, it } from "vitest";
import * as booksRoute from "../app/api/books/route";

describe("legacy HTTP route", () => {
  it("exposes only the read method", () => {
    expect(Object.keys(booksRoute)).toEqual(["GET"]);
  });

  it("rejects malformed capability ids before touching D1", async () => {
    const response = await booksRoute.GET(new Request("https://plot-pile.test/api/books?libraryId=guessable"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "A valid legacy library id is required" });
  });
});

