import { useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants/queryKeys";

/** Invalidates every cache a transaction create/update/delete/import can affect
 * (transactions list, dashboard, category breakdown, savings products, net worth,
 * and the cashflow/annual plan responses whose summary.actual·category_budgets are
 * derived from transactions). Shared by every transaction create/update/delete entry
 * point (list, day modal, import) so they don't drift. */
export function useInvalidateTransactionRelated() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.transactionsAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categoryBreakdownAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProducts });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.netWorth });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cashflowPlanAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.annualPlanAll });
  };
}
