import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/queryKeys";

/** Invalidates every cache a transaction create/update/delete/import can affect
 * (transactions list, dashboard, category breakdown, savings products, net worth,
 * account balances and linked-goal progress, which the backend derives from transactions,
 * the yearly report/trend/retrospective views, and the cashflow/annual plan responses
 * whose summary.actual·category_budgets are derived from transactions). Shared by every transaction create/update/delete entry
 * point (list, day modal, import) so they don't drift. */
export function useInvalidateTransactionRelated() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.transactionsAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categoryBreakdownAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProducts });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.netWorthAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardBootstrap });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cashflowPlanAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.annualPlanAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accounts });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financialGoals });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.recentTransactionsAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.yearlyReportAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categoryTrendAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.monthlyRetrospective });
  };
}
