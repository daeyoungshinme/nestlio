import { useMemo, useState } from "react";
import type {
  ExpenseTypeFilter,
  TopFilter,
  UserFilter,
} from "@/components/transactions/TransactionFilterBar";
import type { CategoryOut, TransactionOut } from "@/types";

/** 가계부 목록의 필터 조건 하나가 거래에 맞는지 검사한다. */
export function matchesFilter(
  tx: TransactionOut,
  topFilter: TopFilter,
  categoryFilter: number | "all",
  expenseTypeFilter: ExpenseTypeFilter,
  userFilter: UserFilter,
): boolean {
  if (userFilter !== "all" && tx.user.id !== userFilter) return false;
  if (topFilter === "savings") return tx.category.is_savings;
  if (topFilter !== "all" && tx.type !== topFilter) return false;
  if (topFilter === "expense" && tx.category.is_savings) return false;
  if (topFilter !== "all" && categoryFilter !== "all" && tx.category.id !== categoryFilter) return false;
  if (topFilter === "expense" && expenseTypeFilter !== "all" && tx.category.type !== expenseTypeFilter) return false;
  return true;
}

/** 가계부 페이지의 4축 필터(구분/카테고리/지출유형/사용자) 상태와, 그 필터가 만들어내는
 * 파생 목록(필터된 거래, 카테고리별 그룹, 칩 옵션)을 함께 관리한다.
 * 상위 필터를 바꾸면 하위 필터는 자동으로 "전체"로 되돌린다. */
export function useLedgerFilters(items: TransactionOut[]) {
  const [topFilter, setTopFilter] = useState<TopFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<ExpenseTypeFilter>("all");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");

  const onChangeTopFilter = (value: TopFilter) => {
    setTopFilter(value);
    setCategoryFilter("all");
    setExpenseTypeFilter("all");
  };
  const onChangeExpenseTypeFilter = (value: ExpenseTypeFilter) => {
    setExpenseTypeFilter(value);
    setCategoryFilter("all");
  };
  const onChangeUserFilter = (value: UserFilter) => {
    setUserFilter(value);
    setCategoryFilter("all");
  };

  const filteredTransactions = useMemo(() => {
    return items
      .filter((tx) => matchesFilter(tx, topFilter, categoryFilter, expenseTypeFilter, userFilter))
      .slice()
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id);
  }, [items, topFilter, categoryFilter, expenseTypeFilter, userFilter]);

  const transactionsByCategory = useMemo(() => {
    const map = new Map<number, TransactionOut[]>();
    for (const tx of filteredTransactions) {
      const list = map.get(tx.category.id) ?? [];
      list.push(tx);
      map.set(tx.category.id, list);
    }
    return map;
  }, [filteredTransactions]);

  const categoryOptions = useMemo<CategoryOut[]>(() => {
    if (topFilter === "all" || topFilter === "savings") return [];
    const byId = new Map<number, CategoryOut>();
    for (const tx of items) {
      if (tx.type !== topFilter || tx.category.is_savings) continue;
      if (userFilter !== "all" && tx.user.id !== userFilter) continue;
      byId.set(tx.category.id, tx.category);
    }
    const options = Array.from(byId.values());
    const scoped =
      topFilter === "expense" && expenseTypeFilter !== "all"
        ? options.filter((c) => c.type === expenseTypeFilter)
        : options;
    return scoped.sort((a, b) => a.sort_order - b.sort_order);
  }, [items, topFilter, expenseTypeFilter, userFilter]);

  const showExpenseGroups = topFilter === "expense" && categoryFilter === "all";

  return {
    topFilter,
    categoryFilter,
    expenseTypeFilter,
    userFilter,
    onChangeTopFilter,
    onChangeExpenseTypeFilter,
    onChangeCategoryFilter: setCategoryFilter,
    onChangeUserFilter,
    filteredTransactions,
    transactionsByCategory,
    categoryOptions,
    showExpenseGroups,
  };
}
