import { QUERY_KEYS } from "@/constants/queryKeys";

export const STALE_TIME = {
  SHORT: 30 * 1000,
  MEDIUM: 5 * 60 * 1000,
  LONG: 30 * 60 * 1000,
};

/** localStorage 영속 캐시 TTL(main.tsx persistOptions.maxAge). */
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

/** React Query 캐시 gcTime의 기본값 — 영속 캐시 TTL 이상이어야 한다. 더 짧으면 한동안 안 쓴 쿼리가
 * 메모리에서 GC되고, 다음 저장 때 localStorage에서도 빠져 "재방문 즉시 표시"가 깨진다. */
export const DEFAULT_GC_TIME = PERSIST_MAX_AGE;

/** 헤더 알림함 폴링 주기. */
export const NOTIFICATIONS_REFETCH_INTERVAL = 60 * 1000;

export const PERSIST_CACHE_KEY = "nestlio:query-cache";

/** 앱 재시작 시 즉시 표시할 캐시를 유지할 쿼리 키 프리픽스 (24h TTL, main.tsx 참고).
 * QUERY_KEYS에서 파생한다 — 프리픽스 문자열을 손으로 다시 적으면 QUERY_KEYS가 바뀔 때
 * 캐시 영속화가 조용히 깨진다. */
export const PERSIST_QUERY_KEYS = new Set<string>([
  QUERY_KEYS.dashboardAll[0],
  QUERY_KEYS.transactionsAll[0],
  QUERY_KEYS.accounts[0],
  QUERY_KEYS.netWorthAll[0],
  QUERY_KEYS.financialGoals[0],
  QUERY_KEYS.cashflowPlanAll[0],
  QUERY_KEYS.annualPlanAll[0],
  QUERY_KEYS.savingsProducts[0],
]);
