import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLedgerFilters } from "@/hooks/useLedgerFilters";
import type { CategoryOut, TransactionOut } from "@/types";

const cat = (id: number, c: Partial<CategoryOut> = {}) =>
  ({ id, name: `c${id}`, type: "variable", is_savings: false, sort_order: id, ...c }) as CategoryOut;

const FOOD = cat(1, { sort_order: 2 });
const RENT = cat(2, { type: "fixed", sort_order: 1 });
const SAVINGS = cat(3, { type: "fixed", is_savings: true });
const SALARY = cat(4, { type: "income" as CategoryOut["type"] });

let nextId = 1;
const tx = (category: CategoryOut, t: Partial<TransactionOut> = {}) =>
  ({
    id: nextId++,
    type: "expense",
    transaction_date: "2026-10-01",
    category,
    user: { id: "u1" },
    ...t,
  }) as TransactionOut;

const items = [
  tx(FOOD, { transaction_date: "2026-10-02" }),
  tx(RENT, { transaction_date: "2026-10-01", user: { id: "u2" } as TransactionOut["user"] }),
  tx(SAVINGS, { transaction_date: "2026-10-03" }),
  tx(SALARY, { type: "income", transaction_date: "2026-10-05" }),
];

describe("useLedgerFilters", () => {
  it("기본은 전체를 최신 날짜순으로", () => {
    const { result } = renderHook(() => useLedgerFilters(items));
    expect(result.current.filteredTransactions.map((t) => t.transaction_date)).toEqual([
      "2026-10-05",
      "2026-10-03",
      "2026-10-02",
      "2026-10-01",
    ]);
  });

  it("지출 필터는 저축 거래를 빼고, 저축 필터는 저축만", () => {
    const { result } = renderHook(() => useLedgerFilters(items));

    act(() => result.current.onChangeTopFilter("expense"));
    expect(result.current.filteredTransactions.map((t) => t.category.id).sort()).toEqual([1, 2]);
    expect(result.current.showExpenseGroups).toBe(true);
    // 카테고리 칩은 지출·비저축 카테고리를 sort_order 순으로
    expect(result.current.categoryOptions.map((c) => c.id)).toEqual([2, 1]);

    act(() => result.current.onChangeTopFilter("savings"));
    expect(result.current.filteredTransactions.map((t) => t.category.id)).toEqual([3]);
    expect(result.current.categoryOptions).toEqual([]);
  });

  it("상위 필터를 바꾸면 하위 카테고리·지출유형 필터가 전체로 돌아간다", () => {
    const { result } = renderHook(() => useLedgerFilters(items));

    act(() => result.current.onChangeTopFilter("expense"));
    act(() => result.current.onChangeExpenseTypeFilter("fixed"));
    expect(result.current.filteredTransactions.map((t) => t.category.id)).toEqual([2]);
    act(() => result.current.onChangeCategoryFilter(2));
    expect(result.current.showExpenseGroups).toBe(false);

    act(() => result.current.onChangeTopFilter("income"));
    expect(result.current.categoryFilter).toBe("all");
    expect(result.current.expenseTypeFilter).toBe("all");
    expect(result.current.filteredTransactions.map((t) => t.category.id)).toEqual([4]);
  });

  it("사용자 필터는 모든 구분에 걸리고 카테고리 칩도 그 사용자 거래로 좁힌다", () => {
    const { result } = renderHook(() => useLedgerFilters(items));

    act(() => result.current.onChangeUserFilter("u2"));
    expect(result.current.filteredTransactions.map((t) => t.category.id)).toEqual([2]);
    act(() => result.current.onChangeTopFilter("expense"));
    expect(result.current.categoryOptions.map((c) => c.id)).toEqual([2]);
  });
});
