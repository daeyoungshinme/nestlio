import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ConfirmModal from "@/components/common/ConfirmModal";
import Modal from "@/components/common/Modal";
import EventForm, { emptyEventFormValues, eventToFormValues } from "@/components/transactions/EventForm";
import { completeEvent, createEvent, deleteEvent, updateEvent } from "@/api/events";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { EventOut, UserOut } from "@/types";

/** 부부 일정(Event)의 추가/수정/삭제/완료와 그 폼·확인 모달을 한 곳에 모은 훅. 가계부의 날짜 모달과
 * "일정" 보기가 같은 동작을 공유한다(구 독립 `/schedule` 페이지의 로직을 가계부로 옮긴 것). 반환된 `modals`를
 * 호출 화면이 그대로 렌더한다. */
export function useEventActions({
  users,
  onSaved,
}: {
  users: UserOut[] | undefined;
  /** 추가·수정 저장 성공 후 호출 — 가계부 날짜 시트가 폼 화면에서 목록으로 돌아가는 데 쓴다. */
  onSaved?: () => void;
}): {
  openCreate: (dateHint: string) => void;
  openEdit: (event: EventOut) => void;
  openDelete: (event: EventOut) => void;
  toggleComplete: (event: EventOut) => void;
  /** 모달 없이 일정 폼만 — 호출 화면이 자기 시트 안에 그린다(가계부 날짜 시트). 저장 결과는 onSaved로 받는다. */
  renderForm: (target: "new" | EventOut, dateHint: string) => ReactNode;
  modals: ReactNode;
} {
  const [formTarget, setFormTarget] = useState<"new" | EventOut | null>(null);
  const [createDateHint, setCreateDateHint] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EventOut | null>(null);
  const queryClient = useQueryClient();
  const invalidateEvents = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsAll });

  const { createMutation, updateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.eventsAll],
    api: { create: createEvent, update: updateEvent },
    messages: { create: "일정을 등록했습니다.", update: "일정을 수정했습니다." },
    onCreateSuccess: () => {
      setFormTarget(null);
      onSaved?.();
    },
    onUpdateSuccess: () => {
      setFormTarget(null);
      onSaved?.();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEvent(id),
    onSuccess: () => {
      invalidateEvents();
      setDeleteTarget(null);
      toast("일정을 삭제했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) => completeEvent(id, completed),
    onSuccess: invalidateEvents,
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const renderForm = (target: "new" | EventOut, dateHint: string) => (
    <EventForm
      initialValues={target === "new" ? emptyEventFormValues(dateHint) : eventToFormValues(target)}
      submitLabel={target === "new" ? "추가" : "저장"}
      submitting={createMutation.isPending || updateMutation.isPending}
      users={users}
      onSubmit={(payload) =>
        target === "new" ? createMutation.mutate(payload) : updateMutation.mutate({ id: target.id, payload })
      }
    />
  );

  const modals = (
    <>
      {formTarget && (
        <Modal onClose={() => setFormTarget(null)} title={formTarget === "new" ? "새 일정" : "일정 수정"}>
          <div className="p-6 overflow-y-auto">{renderForm(formTarget, createDateHint)}</div>
        </Modal>
      )}
      {deleteTarget && (
        <ConfirmModal
          message={`"${deleteTarget.title}" 일정을 삭제할까요?`}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );

  return {
    openCreate: (dateHint) => {
      setCreateDateHint(dateHint);
      setFormTarget("new");
    },
    openEdit: setFormTarget,
    openDelete: setDeleteTarget,
    toggleComplete: (event) => completeMutation.mutate({ id: event.id, completed: !event.completed_at }),
    renderForm,
    modals,
  };
}
