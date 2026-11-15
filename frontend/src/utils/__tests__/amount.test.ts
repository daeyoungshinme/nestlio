import { describe, expect, it } from "vitest";
import { sumAmounts } from "@/utils/amount";

describe("sumAmounts", () => {
  it("Decimal 문자열 금액을 합산한다", () => {
    expect(sumAmounts([{ a: "1000.00" }, { a: "2500" }, { a: 300 }], (x) => x.a)).toBe(3800);
  });

  it("목록이 없거나 값이 null이면 0으로 친다", () => {
    expect(sumAmounts(undefined, (x: { a: string }) => x.a)).toBe(0);
    expect(sumAmounts([{ a: null }, { a: "5" }], (x) => x.a)).toBe(5);
  });
});

describe("sumAmounts with draft inputs", () => {
  it("treats empty and non-numeric values as 0 instead of NaN", () => {
    expect(sumAmounts([{ v: "1000" }, { v: "" }, { v: "abc" }, { v: null }], (x) => x.v)).toBe(1000);
  });
});
