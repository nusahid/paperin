import { describe, expect, it } from "vitest";
import { parseRange, splitPlan } from "../src/shared/plans";
describe("page selection and split composition", () => {
  it("extracts the requested seven pages in the supplied order", () =>
    expect(parseRange("1-3, 7, 10-12", 20)).toEqual([1, 2, 3, 7, 10, 11, 12]));
  it("preserves explicitly supplied order while deduplicating pages", () =>
    expect(parseRange("7, 1-3, 2", 20)).toEqual([7, 1, 2, 3]));
  it.each(["", "0", "1-21", "7-2", "a", "1,,2", "1.5", "1;2"])(
    "rejects invalid range %s",
    (range) => expect(() => parseRange(range, 20)).toThrow(),
  );
  it("divides 23 pages into 5,5,5,5,3", () =>
    expect(
      splitPlan("test", 23, [], "every", "", 5, "report").outputs.map(
        (o) => o.sources[0].pages.length,
      ),
    ).toEqual([5, 5, 5, 5, 3]));
  it("creates a separate output for each range", () =>
    expect(
      splitPlan(
        "test",
        15,
        [],
        "ranges",
        "1-5;6-10;11-15",
        5,
        "report",
      ).outputs.map((o) => o.sources[0].pages),
    ).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 13, 14, 15],
    ]));
  it("rejects empty range groups", () =>
    expect(() =>
      splitPlan("test", 15, [], "ranges", "1-3;", 5, "report"),
    ).toThrow());
  it("keeps only the unselected pages in remove mode", () =>
    expect(
      splitPlan("test", 5, [2, 4], "remove", "", 5, "report").outputs[0]
        .sources[0].pages,
    ).toEqual([1, 3, 5]));
  it("never permits an empty output", () =>
    expect(() =>
      splitPlan("test", 2, [1, 2], "remove", "", 5, "report"),
    ).toThrow());
});
