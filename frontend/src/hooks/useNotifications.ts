import { useQuery } from "@tanstack/react-query";
import { fetchNotifications } from "@/api/notifications";
import { NOTIFICATIONS_REFETCH_INTERVAL } from "@/constants/queryConfig";
import { QUERY_KEYS } from "@/constants/queryKeys";

/** 알림함 목록 — 헤더 종·홈·목표 상세가 같은 키/리페치 주기로 공유한다(한 곳만 폴링하는 것처럼 동작). */
export function useNotifications() {
  return useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: fetchNotifications,
    refetchInterval: NOTIFICATIONS_REFETCH_INTERVAL,
  });
}
