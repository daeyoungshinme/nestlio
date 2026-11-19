import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import EmptyState from "@/components/common/EmptyState";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import DailyTransactionGroups from "@/components/transactions/DailyTransactionGroups";
import ExpenseCategoryGroups from "@/components/transactions/ExpenseCategoryGroups";
import { expenseGroupsFromTransactions } from "@/components/transactions/expenseGroups";
import SavingsLinkedTransactionsSection from "@/components/transactions/SavingsLinkedTransactionsSection";
import type {
  ExpenseTypeFilter,
  TopFilter,
  UserFilter,
} from "@/components/transactions/TransactionFilterBar";
import { fetchCategoryBreakdown } from "@/api/transactions";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { sumAmounts } from "@/utils/amount";
import type { TransactionOut, UserOut } from "@/types";

interface Props {
  dateFrom: string;
  dateTo: string;
  topFilter: TopFilter;
  expenseTypeFilter: ExpenseTypeFilter;
  userFilter: UserFilter;
  showExpenseGroups: boolean;
  /** 검색어가 걸려 있으면 카테고리 그룹을 서버 분해 대신 화면의 검색 결과로 만든다. */
  searchActive: boolean;
  filteredTransactions: TransactionOut[];
  transactionsByCategory: Map<number, TransactionOut[]>;
  totalExpense: string;
  users?: UserOut[];
  showUser: boolean;
  onEdit: (tx: TransactionOut) => void;
  /** 필터·검색이 걸려 있을 때만 — 빈 결과에 "필터 초기화"를 띄운다. */
  onResetFilters?: () => void;
}

export default function LedgerResults({
  dateFrom,
  dateTo,
  topFilter,
  expenseTypeFilter,
  userFilter,
  showExpenseGroups,
  searchActive,
  filteredTransactions,
  transactionsByCategory,
  totalExpense,
  users,
  showUser,
  onEdit,
  onResetFilters,
}: Props) {
  const emptyAction = onResetFilters ? { label: "필터 초기화", onClick: onResetFilters } : undefined;
  const breakdownQuery = useQuery({
    queryKey: QUERY_KEYS.categoryBreakdown({ date_from: dateFrom, date_to: dateTo, type: "expense", user_id: userFilter }),
    queryFn: () =>
      fetchCategoryBreakdown({
        date_from: dateFrom,
        date_to: dateTo,
        type: "expense",
        user_id: userFilter === "all" ? undefined : userFilter,
      }),
    placeholderData: keepPreviousData,
    enabled: showExpenseGroups && !searchActive,
  });
  // 서버 분해는 검색어를 모른다 — 검색 중엔 결과 거래로 그룹을 만들고 비율도 그 합계 대비로 낸다.
  const searchGroups = useMemo(
    () => (searchActive && showExpenseGroups ? expenseGroupsFromTransactions(filteredTransactions) : null),
    [searchActive, showExpenseGroups, filteredTransactions],
  );

  const expenseGroups = useMemo(() => {
    const breakdown = breakdownQuery.data;
    if (!breakdown) return breakdown;
    return expenseTypeFilter === "all" ? breakdown : breakdown.filter((g) => g.type === expenseTypeFilter);
  }, [breakdownQuery.data, expenseTypeFilter]);

  if (topFilter === "savings") {
    return filteredTransactions.length === 0 ? (
      <EmptyState title="해당 조건의 내역이 없어요" action={emptyAction} compact />
    ) : (
      <SavingsLinkedTransactionsSection
        transactions={filteredTransactions}
        onEdit={onEdit}
        showUser={showUser}
        users={users}
      />
    );
  }

  if (searchGroups) {
    return (
      <ExpenseCategoryGroups
        groups={searchGroups}
        transactionsByCategory={transactionsByCategory}
        totalExpense={String(sumAmounts(searchGroups, (g) => g.amount))}
        onEdit={onEdit}
        showUser={showUser}
        users={users}
      />
    );
  }

  if (showExpenseGroups) {
    return (
      <QueryBoundary
        query={breakdownQuery}
        compact
        errorMessage="카테고리별 지출을 불러오지 못했습니다."
        loadingFallback={<SkeletonCard rows={3} />}
      >
        {() =>
          expenseGroups ? (
            <ExpenseCategoryGroups
              groups={expenseGroups}
              transactionsByCategory={transactionsByCategory}
              totalExpense={totalExpense}
              onEdit={onEdit}
              showUser={showUser}
              users={users}
            />
          ) : null
        }
      </QueryBoundary>
    );
  }

  return (
    <DailyTransactionGroups
      transactions={filteredTransactions}
      onEdit={onEdit}
      showUser={showUser}
      users={users}
      emptyAction={emptyAction}
    />
  );
}
