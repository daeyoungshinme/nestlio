import { describe, expect, it } from "vitest";
import { expenseGroupsFromTransactions } from "@/components/transactions/expenseGroups";
import type { TransactionOut } from "@/types";

const food = { id: 1, name: "식비", color: "#111", type: "variable", is_savings: false };
const rent = { id: 2, name: "월세", color: "#222", type: "fixed", is_savings: false };
const savings = { id: 9, name: "저축", color: "#999", type: "fixed", is_savings: true };

function tx(id: number, category: object, amount: string, extra: Partial<TransactionOut> = {}): TransactionOut {
  return { id, type: "expense", amount, category, savings_product_id: null, ...extra } as unknown as TransactionOut;
}

// 검색 중엔 서버 분해가 검색어를 모르므로, 화면의 검색 결과만으로 그룹 금액을 내야 한다.
describe("expenseGroupsFromTransactions", () => {
  it("sums only the given expenses per category, largest first", () => {
    const groups = expenseGroupsFromTransactions([
      tx(1, food, "12000"),
      tx(2, rent, "500000"),
      tx(3, food, "8000"),
      tx(4, food, "3000000", { type: "income" }),
      tx(5, savings, "300000", { savings_product_id: 4 }),
    ]);
    expect(groups).toEqual([
      { category_id: 2, name: "월세", color: "#222", type: "fixed", amount: "500000" },
      { category_id: 1, name: "식비", color: "#111", type: "variable", amount: "20000" },
    ]);
  });
});
