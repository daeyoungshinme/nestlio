import { describe, expect, it } from "vitest";
import { groupItemsByCategory } from "@/utils/categoryGroup";
import type { CategoryOut } from "@/types";

interface Item {
  id: number;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
}

function makeCategory(id: number, sort_order: number, name = `cat${id}`): CategoryOut {
  return {
    id,
    name,
    kind: "expense",
    type: "variable",
    color: "#000000",
    icon: null,
    is_active: true,
    is_discretionary: false,
    is_debt: false,
    is_savings: false,
    sort_order,
    benchmark_group: null,
  };
}

function makeItem(id: number, category_id: number | null, name: string | null = null): Item {
  return { id, category_id, category_name: name, category_color: name ? "#111111" : null };
}

describe("groupItemsByCategory", () => {
  it("groups items by category_id and follows categoryOrder", () => {
    const categories = [makeCategory(2, 0, "식비"), makeCategory(1, 1, "교통")];
    const items = [makeItem(1, 1, "교통"), makeItem(2, 2, "식비"), makeItem(3, 1, "교통")];

    const groups = groupItemsByCategory(items, categories);

    expect(groups.map((g) => g.category_id)).toEqual([2, 1]);
    expect(groups[0].items.map((i) => i.id)).toEqual([2]);
    expect(groups[1].items.map((i) => i.id)).toEqual([1, 3]);
  });

  it("places uncategorized items in a trailing null group", () => {
    const categories = [makeCategory(1, 0, "식비")];
    const items = [makeItem(1, null), makeItem(2, 1, "식비")];

    const groups = groupItemsByCategory(items, categories);

    expect(groups.map((g) => g.category_id)).toEqual([1, null]);
    expect(groups[1].items.map((i) => i.id)).toEqual([1]);
  });

  it("appends categories missing from categoryOrder after known ones, in first-seen order", () => {
    const categories = [makeCategory(1, 0, "식비")];
    const items = [makeItem(1, 3, "기타"), makeItem(2, 1, "식비"), makeItem(3, 2, "교통")];

    const groups = groupItemsByCategory(items, categories);

    expect(groups.map((g) => g.category_id)).toEqual([1, 3, 2]);
  });

  it("returns an empty array for empty input", () => {
    expect(groupItemsByCategory([], [])).toEqual([]);
  });
});
