import { useQuery } from "@tanstack/react-query";
import { fetchCashflowPlan } from "@/api/cashflowPlan";
import { fetchSavingsProductsPlan } from "@/api/savingsProducts";
import { QUERY_KEYS } from "@/constants/queryKeys";

/** 한 달 계획 쿼리 — 계획 탭·대시보드·거래 퀵픽·자산 화면·목표 폼이 같은 키를 공유해 탭을 오가도 캐시를
 * 재사용한다. staleTime은 전역 기본값(main.tsx의 STALE_TIME.SHORT)을 쓴다. */
type PlanQueryOptions = { enabled?: boolean };

export function useCashflowPlan(yearMonth: string, options?: PlanQueryOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.cashflowPlan(yearMonth),
    queryFn: () => fetchCashflowPlan(yearMonth),
    ...options,
  });
}

export function useSavingsProductsPlan(yearMonth: string, options?: PlanQueryOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.savingsProductsPlan(yearMonth),
    queryFn: () => fetchSavingsProductsPlan(yearMonth),
    ...options,
  });
}
