export const STALE_TIME = {
  SHORT: 30 * 1000,
  MEDIUM: 5 * 60 * 1000,
  LONG: 30 * 60 * 1000,
};

export const PERSIST_CACHE_KEY = "nestlio:query-cache";

/** 앱 재시작 시 즉시 표시할 캐시를 유지할 쿼리 키 프리픽스 (24h TTL, main.tsx 참고). */
export const PERSIST_QUERY_KEYS = new Set([
  "dashboard",
  "transactions",
  "budgets",
  "accounts",
  "net-worth",
  "financial-goals",
  "cashflow-plan",
  "annual-plan",
  "savings-products",
]);
