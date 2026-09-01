import type { QueryClient } from "@tanstack/react-query";
import { PERSIST_CACHE_KEY } from "@/constants/queryConfig";

/** 로그아웃·세션 만료 시 공통으로 실행하는 클라이언트 캐시 정리.
 * 메모리 쿼리 캐시와 localStorage에 영속화된 쿼리 캐시(PERSIST_CACHE_KEY)를 모두 비운다 —
 * 이걸 빠뜨리면 만료된 세션의 대시보드/거래 데이터가 다음 로그인 화면까지 잠깐 남는다.
 * Supabase 세션과 AUTH_ME_CACHE_KEY 정리는 authStore.logout()이 담당하므로 여기서 하지 않는다. */
export function clearClientCaches(queryClient: QueryClient): void {
  queryClient.clear();
  try {
    window.localStorage.removeItem(PERSIST_CACHE_KEY);
  } catch {
    // localStorage 접근 불가(프라이빗 모드 등) — 무시
  }
}
