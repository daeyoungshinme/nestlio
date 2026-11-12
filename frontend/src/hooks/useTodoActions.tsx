import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ConfirmModal from "@/components/common/ConfirmModal";
import Modal from "@/components/common/Modal";
import TodoForm from "@/components/todos/TodoForm";
import { completeTodo, createTodo, deleteTodo, updateTodo } from "@/api/todos";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { useMe } from "@/hooks/useReferenceData";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { toast } from "@/utils/toast";
import { isCheckedBy } from "@/utils/todos";
import type { TodoOut, UserOut } from "@/types";

/** 부부 할일의 추가/수정/삭제/완료와 그 폼·확인 모달을 한 곳에 모은 훅. 홈 카드와 `/todos` 화면이 같은 동작을
 * 공유한다(useEventActions와 같은 구조). 반환된 `modals`를 호출 화면이 그대로 렌더한다. */
export function useTodoActions({ users }: { users: UserOut[] | undefined }): {
  openCreate: () => void;
  openEdit: (todo: TodoOut) => void;
  openDelete: (todo: TodoOut) => void;
  toggleComplete: (todo: TodoOut) => void;
  modals: ReactNode;
} {
  const [formTarget, setFormTarget] = useState<"new" | TodoOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TodoOut | null>(null);
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const invalidateTodos = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.todosAll });

  const { createMutation, updateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.todosAll],
    api: { create: createTodo, update: updateTodo },
    messages: { create: "할일을 등록했습니다.", update: "할일을 수정했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTodo(id),
    onSuccess: () => {
      invalidateTodos();
      setDeleteTarget(null);
      toast("할일을 삭제했습니다.", "success");
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) => completeTodo(id, completed),
    onSuccess: invalidateTodos,
  });

  const modals = (
    <>
      {formTarget && (
        <Modal onClose={() => setFormTarget(null)} title={formTarget === "new" ? "새 할일" : "할일 수정"}>
          <div className="p-6 overflow-y-auto">
            <TodoForm
              todo={formTarget === "new" ? undefined : formTarget}
              submitLabel={formTarget === "new" ? "추가" : "저장"}
              submitting={createMutation.isPending || updateMutation.isPending}
              users={users}
              onSubmit={(payload) =>
                formTarget === "new"
                  ? createMutation.mutate(payload)
                  : updateMutation.mutate({ id: formTarget.id, payload })
              }
            />
          </div>
        </Modal>
      )}
      {deleteTarget && (
        <ConfirmModal
          message={`"${deleteTarget.title}" 할일을 삭제할까요?`}
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );

  return {
    openCreate: () => setFormTarget("new"),
    openEdit: setFormTarget,
    openDelete: setDeleteTarget,
    // 각자 완료 할일은 내 몫 기준으로 토글한다(배우자만 체크한 상태에서 누르면 내 몫을 체크).
    toggleComplete: (todo) => completeMutation.mutate({ id: todo.id, completed: !isCheckedBy(todo, me?.id) }),
    modals,
  };
}
