import { useMutation } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { createRecurring, deactivateRecurring, reactivateRecurring, updateRecurring } from "@/api/recurring";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { RecurringCreateIn, RecurringOut, RecurringUpdateIn } from "@/types";

/** 반복 내역이 바뀌면 함께 낡는 캐시 — 캘린더의 recurring_due 배지(모든 월), 현금흐름계획의
 * 연결 배지(`recurring_active`)·예산, 이를 읽는 대시보드 코칭. 호출부마다 고르던 것을 여기로 고정한다. */
const RECURRING_RELATED_KEYS: QueryKey[] = [
  QUERY_KEYS.recurring,
  QUERY_KEYS.eventsAll,
  QUERY_KEYS.cashflowPlanAll,
  QUERY_KEYS.dashboardAll,
];

interface Options {
  messages?: { create?: string; update?: string; remove?: string; reactivate?: string };
  onCreateSuccess?: (item: RecurringOut) => void;
  onUpdateSuccess?: (item: RecurringOut) => void;
  onRemoveSuccess?: () => void;
  onReactivateSuccess?: (item: RecurringOut) => void;
}

/** 반복 내역(RecurringExpense) 생성/수정/비활성화/재활성화 mutation 4종을 캡슐화한다.
 * "반복 내역 관리" 시트와 현금흐름계획의 "반복내역으로 등록" 흐름이 각자 페이로드 변환과
 * invalidate/toast 로직을 따로 구현하던 것을 하나로 모았다 — 페이로드 변환 자체는
 * `RecurringForm`의 `buildRecurringPayload`를 함께 쓴다. 재활성화는 useCrudMutations의
 * create/update/remove 3종 고정 계약에 맞지 않아 별도 mutation으로 손으로 추가한다. */
export function useRecurringMutations({
  messages,
  onCreateSuccess,
  onUpdateSuccess,
  onRemoveSuccess,
  onReactivateSuccess,
}: Options = {}) {
  const { createMutation, updateMutation, removeMutation, invalidate } = useCrudMutations<
    RecurringCreateIn,
    RecurringUpdateIn,
    RecurringOut
  >({
    invalidateKeys: RECURRING_RELATED_KEYS,
    api: { create: createRecurring, update: updateRecurring, remove: deactivateRecurring },
    messages,
    onCreateSuccess,
    onUpdateSuccess,
    onRemoveSuccess,
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateRecurring,
    onSuccess: (item) => {
      invalidate();
      if (messages?.reactivate) toast(messages.reactivate, "success");
      onReactivateSuccess?.(item);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return { createMutation, updateMutation, removeMutation, reactivateMutation };
}
