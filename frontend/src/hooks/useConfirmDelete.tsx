import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import ConfirmModal from "@/components/common/ConfirmModal";

/** "삭제할까요?" 확인 모달과 삭제 뮤테이션 — 할일·일정·거래 액션 훅이 함께 쓴다. `openDelete`로 대상을 고르면 반환된
 * `modal`이 확인을 묻고, 확인하면 삭제한 뒤 `onDeleted`를 부르고 모달을 닫는다. 확인 없이 바로 지울 때(추가 직후
 * "취소" 토스트)는 `deleteNow`. 저장 중에는 확인 버튼이 잠긴다. */
export function useConfirmDelete<T extends { id: number }>({
  remove,
  message,
  onDeleted,
}: {
  remove: (id: number) => Promise<unknown>;
  message: (target: T) => string;
  onDeleted: () => void;
}): { openDelete: (target: T) => void; deleteNow: (id: number) => void; modal: ReactNode } {
  const [target, setTarget] = useState<T | null>(null);
  const mutation = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      setTarget(null);
      onDeleted();
    },
  });

  const modal = target && (
    <ConfirmModal
      message={message(target)}
      loading={mutation.isPending}
      onConfirm={() => mutation.mutate(target.id)}
      onCancel={() => setTarget(null)}
    />
  );

  return { openDelete: setTarget, deleteNow: (id) => mutation.mutate(id), modal };
}
