import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTransaction } from "@/api/transactions";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { TransactionOut } from "@/types";

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

/** 거래 추가 mutation — 대시보드 빠른 추가, 거래내역 페이지, 현금흐름계획 "가계부에 추가"가 공유한다.
 * 연관 캐시 무효화와 실패 토스트는 여기서 하고, 모달 닫기·성공 토스트(문구/되돌리기 버튼이 화면마다
 * 다름)는 호출부의 `onCreated`가 맡는다. */
export function useCreateTransaction(onCreated: (created: TransactionOut) => void) {
  const invalidateAll = useInvalidateTransactionRelated();
  return useMutation({
    mutationFn: createTransaction,
    onSuccess: (created) => {
      invalidateAll();
      onCreated(created);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });
}
