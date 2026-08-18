import { describe, expect, it } from "vitest";
import { buildYearMonthRange, distributeAmountEvenly } from "@/utils/monthRange";

describe("buildYearMonthRange", () => {
  it("returns every month between start and end, inclusive", () => {
    expect(buildYearMonthRange("2026-09", "2026-11")).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("returns a single-element array when start equals end", () => {
    expect(buildYearMonthRange("2026-09", "2026-09")).toEqual(["2026-09"]);
  });

  it("rolls over the year boundary", () => {
    expect(buildYearMonthRange("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("returns an empty array when end is before start", () => {
    expect(buildYearMonthRange("2026-11", "2026-09")).toEqual([]);
  });

  it("returns an empty array when either bound is missing", () => {
    expect(buildYearMonthRange("", "2026-09")).toEqual([]);
    expect(buildYearMonthRange("2026-09", "")).toEqual([]);
  });
});

describe("distributeAmountEvenly", () => {
  it("splits evenly when the total divides cleanly", () => {
    expect(distributeAmountEvenly("300000", ["2026-09", "2026-10", "2026-11"])).toEqual({
      "2026-09": "100000",
      "2026-10": "100000",
      "2026-11": "100000",
    });
  });

  it("distributes the remainder 1 won at a time to the earliest months", () => {
    expect(distributeAmountEvenly("100000", ["2026-09", "2026-10", "2026-11"])).toEqual({
      "2026-09": "33334",
      "2026-10": "33333",
      "2026-11": "33333",
    });
  });

  it("returns an empty object when there are no months", () => {
    expect(distributeAmountEvenly("100000", [])).toEqual({});
  });

  it("treats a non-numeric or empty total as 0", () => {
    expect(distributeAmountEvenly("", ["2026-09", "2026-10"])).toEqual({ "2026-09": "0", "2026-10": "0" });
  });
});
