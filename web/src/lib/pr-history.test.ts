import { describe, expect, it } from "vitest";
import { compactDate, sortRecentFirst } from "./pr-history";
import type { PREventEntry } from "./types";

function prEvent(
  variation: string,
  recordedAt: string | null,
  programNumber: number | null,
): PREventEntry {
  return {
    variation,
    variation_canon: variation.toLowerCase(),
    is_competition: true,
    program_id: 1,
    program_name: `Block ${programNumber ?? "none"}`,
    program_number: programNumber,
    e1rm: 400,
    prev_best_e1rm: 390,
    delta: 10,
    recorded_at: recordedAt,
  };
}

describe("PR history helpers", () => {
  describe("compactDate", () => {
    it("handles null and malformed values", () => {
      expect(compactDate(null)).toBe("Date pending");
      expect(compactDate("not-a-date")).toBe("Date pending");
    });

    it("formats date-only values from local date parts", () => {
      expect(compactDate("2026-03-04")).toBe("Wed, Mar 4");
    });

    it("formats ISO datetime values", () => {
      expect(compactDate("2026-03-05T18:00:00Z")).toBe("Thu, Mar 5");
    });
  });

  describe("sortRecentFirst", () => {
    it("orders by recorded date, then program number, then variation name", () => {
      const rows = [
        prEvent("Oldest", "2026-02-01", 99),
        prEvent("Lower block", "2026-03-01", 4),
        prEvent("Bravo", "2026-03-01", 5),
        prEvent("Newest", "2026-04-01", 1),
        prEvent("Alpha", "2026-03-01", 5),
      ];

      const sorted = [...rows].sort(sortRecentFirst).map((event) => event.variation);

      expect(sorted).toEqual([
        "Newest",
        "Alpha",
        "Bravo",
        "Lower block",
        "Oldest",
      ]);
    });
  });
});
