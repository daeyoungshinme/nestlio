import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAnnualPlan } from "@/api/annualPlan";
import { fetchCashflowPlan } from "@/api/cashflowPlan";
import { fetchSavingsProductsAnnualPlan, fetchSavingsProductsPlan } from "@/api/savingsProducts";
import { QUERY_KEYS } from "@/constants/queryKeys";

/** 계획 쿼리(한 달·연간) — 계획 탭·대시보드·거래 퀵픽·자산 화면·목표 폼이 같은 키를 공유해 탭을 오가도 캐시를
 * 재사용한다. staleTime은 전역 기본값(main.tsx의 STALE_TIME.SHORT)을 쓴다. */
type PlanQueryOptions = {
  enabled?: boolean;
  /** 해·달을 넘길 때 이전 데이터를 보여 주며 받는다 — 화면 전체가 스켈레톤으로 깜빡이지 않게. */
  keepPrevious?: boolean;
};

function planQueryOptions({ keepPrevious, ...rest }: PlanQueryOptions = {}) {
  return { ...rest, placeholderData: keepPrevious ? keepPreviousData : undefined };
}

export function useCashflowPlan(yearMonth: string, options?: PlanQueryOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.cashflowPlan(yearMonth),
    queryFn: () => fetchCashflowPlan(yearMonth),
    ...planQueryOptions(options),
  });
}

export function useSavingsProductsPlan(yearMonth: string, options?: PlanQueryOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.savingsProductsPlan(yearMonth),
    queryFn: () => fetchSavingsProductsPlan(yearMonth),
    ...planQueryOptions(options),
  });
}

export function useAnnualPlan(year: number, options?: PlanQueryOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.annualPlan(year),
    queryFn: () => fetchAnnualPlan(year),
    ...planQueryOptions(options),
  });
}

export function useSavingsProductsAnnualPlan(year: number, options?: PlanQueryOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.savingsProductsAnnualPlan(year),
    queryFn: () => fetchSavingsProductsAnnualPlan(year),
    ...planQueryOptions(options),
  });
}
