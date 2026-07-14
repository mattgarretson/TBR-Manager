import { describe, expect, it } from "vitest";
import { libraryErrorMessage } from "../lib/library/errors";

describe("library errors", () => {
  it("turns quota failures into a recoverable storage message", () => {
    const error = new DOMException("The quota has been exceeded", "QuotaExceededError");
    expect(libraryErrorMessage(error, "fallback")).toContain("low on storage");
  });

  it("preserves useful domain errors and uses a fallback for unknown failures", () => {
    expect(libraryErrorMessage(new Error("Invalid backup"), "fallback")).toBe("Invalid backup");
    expect(libraryErrorMessage(null, "fallback")).toBe("fallback");
  });
});

