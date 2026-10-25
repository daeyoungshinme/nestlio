import { MutationCache } from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";

/** 뮤테이션 실패 토스트의 단일 출처 — 자체 onError가 없는 뮤테이션만 서버 메시지를 토스트한다(있는 쪽은
 * 각자 문구로 알리므로 중복 방지). api/client.ts가 5xx를 전역 토스트하지 않기 때문에 이 폴백이 없으면
 * 조용히 실패한다. 같은 토스트를 띄우는 인라인 onError는 두지 않는다. */
export function createMutationCache() {
  return new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!mutation.options.onError) toast(extractErrorMessage(error), "error");
    },
  });
}

/** 여러 캐시 키를 한 번에 무효화한다 — `*_RELATED_KEYS` 묶음이나 화면별 키 목록을 넘긴다. */
export function invalidateKeys(queryClient: QueryClient, keys: readonly QueryKey[]) {
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}
