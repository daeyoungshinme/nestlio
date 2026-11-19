import { describe, expect, it } from "vitest";
import { groupTopCategories } from "@/components/plan/pieGrouping";
import { CATEGORY_SWATCH_FALLBACK_COLOR } from "@/utils/colors";
import type { CategoryAmountOut } from "@/types";

const row = (name: string, amount: string): CategoryAmountOut =>
  ({ category_id: name.length, name, color: `#${name}`, type: "variable", amount }) as CategoryAmountOut;

describe("groupTopCategories", () => {
  it("keeps the largest N and folds the rest into one 기타 slice", () => {
    const slices = groupTopCategories(
      [row("a", "10"), row("b", "50"), row("c", "30"), row("d", "5"), row("e", "1")],
      2,
    );
    expect(slices).toEqual([
      { name: "b", value: 50, color: "#b" },
      { name: "c", value: 30, color: "#c" },
      { name: "기타", value: 16, color: CATEGORY_SWATCH_FALLBACK_COLOR },
    ]);
  });

  it("does not fold a single leftover category into 기타", () => {
    const slices = groupTopCategories([row("a", "10"), row("b", "50"), row("c", "30")], 2);
    expect(slices.map((s) => s.name)).toEqual(["b", "c", "a"]);
  });

  it("returns an empty list for no spending", () => {
    expect(groupTopCategories([], 5)).toEqual([]);
  });
});
