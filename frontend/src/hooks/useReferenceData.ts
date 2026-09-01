import { useQuery } from "@tanstack/react-query";
import { fetchAccounts } from "@/api/accounts";
import { fetchCategories } from "@/api/categories";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { fetchMe, fetchUsers } from "@/api/users";
import { STALE_TIME } from "@/constants/queryConfig";
import { QUERY_KEYS } from "@/constants/queryKeys";

/** 여러 화면이 공유하는, 느리게 변하는 참조 데이터(계좌·카테고리·저축상품·유저) 쿼리 훅.
 *
 * raw `useQuery` + 제각각 `staleTime`(LONG/MEDIUM/미지정)으로 ~15개 파일 30여 곳에서
 * 재선언되던 것을 하나로 모아, 쿼리 키(`QUERY_KEYS`)와 기본 `staleTime`을 한 곳에서
 * 관리한다. 참조 데이터는 관련 mutation이 성공 시 해당 키를 invalidate하므로
 * `staleTime`은 정합성이 아니라 백그라운드 리페치 빈도에만 영향을 준다.
 *
 * 호출부가 마운트 조건(`enabled`)이나 리페치 주기(`staleTime`)를 조정해야 하면
 * `options`로 넘겨 기본값을 덮어쓴다. */
type RefDataOptions = { enabled?: boolean; staleTime?: number };

export function useAccounts(options?: RefDataOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.accounts,
    queryFn: fetchAccounts,
    staleTime: STALE_TIME.MEDIUM,
    ...options,
  });
}

export function useCategories(kind?: "income" | "expense", options?: RefDataOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.categories(kind),
    queryFn: () => fetchCategories(kind),
    staleTime: STALE_TIME.LONG,
    ...options,
  });
}

export function useSavingsProducts(options?: RefDataOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.savingsProducts,
    queryFn: fetchSavingsProducts,
    staleTime: STALE_TIME.MEDIUM,
    ...options,
  });
}

export function useUsers(options?: RefDataOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.users,
    queryFn: fetchUsers,
    staleTime: STALE_TIME.LONG,
    ...options,
  });
}

export function useMe(options?: RefDataOptions) {
  return useQuery({
    queryKey: QUERY_KEYS.me,
    queryFn: fetchMe,
    staleTime: STALE_TIME.LONG,
    ...options,
  });
}
