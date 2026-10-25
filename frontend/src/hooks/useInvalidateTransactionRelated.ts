import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTransaction } from "@/api/transactions";
import { TRANSACTION_RELATED_KEYS } from "@/constants/queryKeys";
import { invalidateKeys } from "@/utils/queryClient";
import type { TransactionOut } from "@/types";

/** Invalidates every cache a transaction create/update/delete/import can affect
 * (TRANSACTION_RELATED_KEYS). Shared by every transaction create/update/delete entry
 * point (list, day modal, import) so they don't drift. */
export function useInvalidateTransactionRelated() {
  const queryClient = useQueryClient();
  return () => invalidateKeys(queryClient, TRANSACTION_RELATED_KEYS);
}

/** 거래 추가 mutation — 대시보드 빠른 추가, 거래내역 페이지, 현금흐름계획 "가계부에 추가"가 공유한다.
 * 연관 캐시 무효화와 실패 토스트는 여기서 하고, 모달 닫기·성공 토스트(문구/되돌리기 버튼이 화면마다
 * 다름)는 호출부의 `onCreated`가 맡는다. */
export function useCreateTransaction(onCreated: (created: TransactionOut) => void) {
  const invalidateAll = useInvalidateTransactionRelated();
  return useMutation({
    mutationFn: createTransaction,
    onSuccess: (created) => {
      invalidateAll();
      onCreated(created);
    },
  });
}
