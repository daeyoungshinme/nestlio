import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchEvents } from "@/api/events";
import { fetchTodos } from "@/api/todos";
import { QUERY_KEYS } from "@/constants/queryKeys";
import type { TodoStatus } from "@/types";

/** 부부 할일 목록(진행 중/완료). 홈 카드와 `/todos`가 같은 캐시를 쓴다. */
export function useTodos(status: TodoStatus) {
  return useQuery({
    queryKey: QUERY_KEYS.todos(status),
    queryFn: () => fetchTodos(status),
  });
}

/** 기간 안의 일정(반복 전개 포함)과 예정 반복거래. `keepPrevious`면 기간을 바꾸는 동안 이전 기간 응답을 보여준다
 * (가계부 캘린더의 달 이동). */
export function useEvents(dateFrom: string, dateTo: string, { keepPrevious = false }: { keepPrevious?: boolean } = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.events(dateFrom, dateTo),
    queryFn: () => fetchEvents(dateFrom, dateTo),
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  });
}
