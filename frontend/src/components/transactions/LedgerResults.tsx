import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import EmptyState from "@/components/common/EmptyState";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import DailyTransactionGroups from "@/components/transactions/DailyTransactionGroups";
import ExpenseCategoryGroups from "@/components/transactions/ExpenseCategoryGroups";
import SavingsLinkedTransactionsSection from "@/components/transactions/SavingsLinkedTransactionsSection";
import type {
  ExpenseTypeFilter,
  TopFilter,
  UserFilter,
} from "@/components/transactions/TransactionFilterBar";
import { fetchCategoryBreakdown } from "@/api/transactions";
import { QUERY_KEYS } from "@/constants/queryKeys";
import type { TransactionOut, UserOut } from "@/types";

interface Props {
  dateFrom: string;
  dateTo: string;
  topFilter: TopFilter;
  expenseTypeFilter: ExpenseTypeFilter;
  userFilter: UserFilter;
  showExpenseGroups: boolean;
  filteredTransactions: TransactionOut[];
  transactionsByCategory: Map<number, TransactionOut[]>;
  totalExpense: string;
  users?: UserOut[];
  showUser: boolean;
  onEdit: (tx: TransactionOut) => void;
  onDelete: (tx: TransactionOut) => void;
}

export default function LedgerResults({
  dateFrom,
  dateTo,
  topFilter,
  expenseTypeFilter,
  userFilter,
  showExpenseGroups,
  filteredTransactions,
  transactionsByCategory,
  totalExpense,
  users,
  showUser,
  onEdit,
  onDelete,
}: Props) {
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
    enabled: showExpenseGroups,
  });

  const expenseGroups = useMemo(() => {
    const breakdown = breakdownQuery.data;
    if (!breakdown) return breakdown;
    return expenseTypeFilter === "all" ? breakdown : breakdown.filter((g) => g.type === expenseTypeFilter);
  }, [breakdownQuery.data, expenseTypeFilter]);

  if (topFilter === "savings") {
    return filteredTransactions.length === 0 ? (
      <EmptyState title="해당 조건의 내역이 없어요" compact />
    ) : (
      <SavingsLinkedTransactionsSection
        transactions={filteredTransactions}
        onEdit={onEdit}
        onDelete={onDelete}
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
              onDelete={onDelete}
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
      onDelete={onDelete}
      showUser={showUser}
      users={users}
    />
  );
}
