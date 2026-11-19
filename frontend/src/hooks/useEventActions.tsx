import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Modal from "@/components/common/Modal";
import EventForm, { emptyEventFormValues, eventToFormValues } from "@/components/transactions/EventForm";
import { completeEvent, createEvent, deleteEvent, updateEvent } from "@/api/events";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { occurrenceDate } from "@/utils/date";
import { toast } from "@/utils/toast";
import type { EventOut, UserOut } from "@/types";

/** 부부 일정(Event)의 추가/수정/삭제/완료와 그 폼·확인 모달을 한 곳에 모은 훅. 가계부의 날짜 상세(`LedgerDayDetail`)와
 * "일정" 목록이 같은 동작을 공유한다(구 독립 `/schedule` 페이지의 로직을 가계부로 옮긴 것). 반환된 `modals`를
 * 호출 화면이 그대로 렌더한다. */
export function useEventActions({
  users,
}: {
  users: UserOut[] | undefined;
}): {
  openCreate: (dateHint: string) => void;
  openEdit: (event: EventOut) => void;
  openDelete: (event: EventOut) => void;
  toggleComplete: (event: EventOut) => void;
  modals: ReactNode;
} {
  const [formTarget, setFormTarget] = useState<"new" | EventOut | null>(null);
  const [createDateHint, setCreateDateHint] = useState("");
  const queryClient = useQueryClient();
  const invalidateEvents = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsAll });

  const { createMutation, updateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.eventsAll],
    api: { create: createEvent, update: updateEvent },
    messages: { create: "일정을 등록했습니다.", update: "일정을 수정했습니다." },
    onCreateSuccess: () => {
      setFormTarget(null);
    },
    onUpdateSuccess: () => {
      setFormTarget(null);
    },
  });

  const { openDelete, modal: deleteModal } = useConfirmDelete<EventOut>({
    remove: deleteEvent,
    message: (event) => `"${event.title}" 일정을 삭제할까요?`,
    onDeleted: () => {
      invalidateEvents();
      toast("일정을 삭제했습니다.", "success");
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, completed, occurrenceDate: date }: { id: number; completed: boolean; occurrenceDate: string }) =>
      completeEvent(id, completed, date),
    onSuccess: invalidateEvents,
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
      {deleteModal}
    </>
  );

  return {
    openCreate: (dateHint) => {
      setCreateDateHint(dateHint);
      setFormTarget("new");
    },
    openEdit: setFormTarget,
    openDelete,
    toggleComplete: (event) =>
      completeMutation.mutate({
        id: event.id,
        completed: !event.completed_at,
        occurrenceDate: occurrenceDate(event.occurrence_start),
      }),
    modals,
  };
}
