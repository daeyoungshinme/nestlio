import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryOut } from "@/types";

const createCategory = vi.fn();
const updateCategory = vi.fn();
vi.mock("@/api/categories", () => ({
  createCategory: (...args: unknown[]) => createCategory(...args),
  updateCategory: (...args: unknown[]) => updateCategory(...args),
  deactivateCategory: vi.fn(),
}));

const FOOD: CategoryOut = {
  id: 3,
  name: "식비",
  kind: "expense",
  type: "variable",
  color: "#ff0000",
  benchmark_group: "food",
  is_active: true,
  is_savings: false,
} as CategoryOut;

vi.mock("@/hooks/useReferenceData", () => ({
  useCategories: () => ({ data: [FOOD], isLoading: false }),
}));

const { default: CategoriesSection } = await import("@/components/categories/CategoriesSection");

function renderSection() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <CategoriesSection />
    </QueryClientProvider>,
  );
}

describe("CategoriesSection", () => {
  beforeEach(() => {
    createCategory.mockReset().mockResolvedValue({ ...FOOD, id: 9 });
    updateCategory.mockReset().mockResolvedValue(FOOD);
  });

  it("추가 폼은 비어서 열리고, 표준 카테고리를 안 고르면 null로 보낸다", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /카테고리 추가/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^이름/), { target: { value: "간식" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "추가" }));

    await waitFor(() => expect(createCategory).toHaveBeenCalled());
    expect(createCategory.mock.calls[0][0]).toEqual({
      name: "간식",
      kind: "expense",
      type: "variable",
      color: expect.any(String),
      benchmark_group: null,
    });
  });

  it("수정 폼은 기존 값으로 채워지고 바꾼 값과 함께 저장한다", async () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /수정/ }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByLabelText(/^이름/) as HTMLInputElement;
    expect(name.value).toBe("식비");
    fireEvent.change(name, { target: { value: "외식" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));

    await waitFor(() => expect(updateCategory).toHaveBeenCalled());
    expect(updateCategory.mock.calls[0]).toEqual([
      3,
      { name: "외식", kind: "expense", type: "variable", color: "#ff0000", benchmark_group: "food" },
    ]);
  });
});
