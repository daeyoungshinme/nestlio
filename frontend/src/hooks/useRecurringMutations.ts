import type { QueryKey } from "@tanstack/react-query";
import { createRecurring, deactivateRecurring, updateRecurring } from "@/api/recurring";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import type { RecurringCreateIn, RecurringOut, RecurringUpdateIn } from "@/types";

interface Options {
  /** Invalidated in addition to QUERY_KEYS.recurring on every successful create/update/deactivate. */
  extraInvalidateKeys?: QueryKey[];
  messages?: { create?: string; update?: string; remove?: string };
  onCreateSuccess?: (item: RecurringOut) => void;
  onUpdateSuccess?: (item: RecurringOut) => void;
  onRemoveSuccess?: () => void;
}

/** 반복 내역(RecurringExpense) 생성/수정/비활성화 mutation 3종을 캡슐화한다.
 * "반복 내역 관리" 시트와 현금흐름계획의 "반복내역으로 등록" 흐름이 각자 페이로드 변환과
 * invalidate/toast 로직을 따로 구현하던 것을 하나로 모았다 — 페이로드 변환 자체는
 * `RecurringForm`의 `buildRecurringPayload`를 함께 쓴다. */
export function useRecurringMutations({
  extraInvalidateKeys = [],
  messages,
  onCreateSuccess,
  onUpdateSuccess,
  onRemoveSuccess,
}: Options = {}) {
  return useCrudMutations<RecurringCreateIn, RecurringUpdateIn, RecurringOut>({
    invalidateKeys: [QUERY_KEYS.recurring, ...extraInvalidateKeys],
    api: { create: createRecurring, update: updateRecurring, remove: deactivateRecurring },
    messages,
    onCreateSuccess,
    onUpdateSuccess,
    onRemoveSuccess,
  });
}
