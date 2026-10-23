import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CategoryChipPicker, {
  CATEGORY_CHIP_VISIBLE_COUNT,
  orderCategoriesByUsage,
} from "@/components/common/CategoryChipPicker";
import type { CategoryOut } from "@/types";

const make = (id: number, sort_order = id): CategoryOut =>
  ({ id, name: `카테고리${id}`, kind: "expense", type: "variable", color: "#000", is_active: true, sort_order }) as CategoryOut;

describe("orderCategoriesByUsage", () => {
  it("puts frequently used categories first, then falls back to sort_order", () => {
    const ordered = orderCategoriesByUsage([make(1), make(2), make(3)], [3, 2, 3]);
    expect(ordered.map((c) => c.id)).toEqual([3, 2, 1]);
  });
});

describe("CategoryChipPicker", () => {
  const many = Array.from({ length: CATEGORY_CHIP_VISIBLE_COUNT + 3 }, (_, i) => make(i + 1));

  it("selects a category with one tap and marks it pressed", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CategoryChipPicker categories={many} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "카테고리2" }));
    expect(onChange).toHaveBeenCalledWith("2");

    rerender(<CategoryChipPicker categories={many} value="2" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "카테고리2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("collapses beyond the visible count but keeps a hidden selection visible", () => {
    const hiddenId = CATEGORY_CHIP_VISIBLE_COUNT + 2;
    render(<CategoryChipPicker categories={many} value={String(hiddenId)} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: `카테고리${hiddenId}` })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: `카테고리${CATEGORY_CHIP_VISIBLE_COUNT + 1}` })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "더보기 2" }));
    expect(screen.getByRole("button", { name: `카테고리${CATEGORY_CHIP_VISIBLE_COUNT + 1}` })).toBeInTheDocument();
  });

  it("shows the required error only while nothing is selected", () => {
    const { rerender } = render(
      <CategoryChipPicker categories={many} value="" onChange={() => {}} showRequiredError />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("카테고리를 골라주세요");
    rerender(<CategoryChipPicker categories={many} value="1" onChange={() => {}} showRequiredError />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
