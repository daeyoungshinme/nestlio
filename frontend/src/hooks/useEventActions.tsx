import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ConfirmModal from "@/components/common/ConfirmModal";
import Modal from "@/components/common/Modal";
import EventForm, { emptyEventFormValues, eventToFormValues } from "@/components/transactions/EventForm";
import { completeEvent, createEvent, deleteEvent, importGoogleEvents, updateEvent } from "@/api/events";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { EventOut, UserOut } from "@/types";

/** 부부 일정(Event)의 추가/수정/삭제/완료/구글 가져오기와 그 폼·확인 모달을 한 곳에 모은 훅. 가계부의 날짜 모달과
 * "일정" 보기가 같은 동작을 공유한다(구 독립 `/schedule` 페이지의 로직을 가계부로 옮긴 것). 반환된 `modals`를
 * 호출 화면이 그대로 렌더한다. */
export function useEventActions({
  users,
  dateFrom,
  dateTo,
}: {
  users: UserOut[] | undefined;
  dateFrom: string;
  dateTo: string;
}): {
  openCreate: (dateHint: string) => void;
  openEdit: (event: EventOut) => void;
  openDelete: (event: EventOut) => void;
  toggleComplete: (event: EventOut) => void;
  importGoogle: () => void;
  importingGoogle: boolean;
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
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
  });

  // 삭제는 source별로 다른 토스트 문구가 필요해 따로 정의한다.
  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: number; source: EventOut["source"] }) => deleteEvent(id),
    onSuccess: (_data, variables) => {
      invalidateEvents();
      setDeleteTarget(null);
      toast(
        variables.source === "google_import" ? "Google 캘린더 일정을 목록에서 숨겼습니다." : "일정을 삭제했습니다.",
        "success",
      );
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) => completeEvent(id, completed),
    onSuccess: invalidateEvents,
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const importGoogleMutation = useMutation({
    mutationFn: () => importGoogleEvents(dateFrom, dateTo),
    onSuccess: (result) => {
      invalidateEvents();
      const changed = result.created + result.updated;
      toast(
        changed === 0 ? "이미 최신 상태예요. 새로 가져온 일정은 없습니다." : `구글 캘린더에서 ${changed}건을 반영했어요.`,
        "success",
      );
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const modals = (
    <>
      {formTarget && (
        <Modal onClose={() => setFormTarget(null)} title={formTarget === "new" ? "새 일정" : "일정 수정"}>
          <div className="p-6 overflow-y-auto">
            <EventForm
              initialValues={formTarget === "new" ? emptyEventFormValues(createDateHint) : eventToFormValues(formTarget)}
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
          message={
            deleteTarget.source === "google_import"
              ? `"${deleteTarget.title}" 일정을 목록에서 숨길까요? Google 캘린더의 원본 일정은 삭제되지 않습니다.`
              : `"${deleteTarget.title}" 일정을 삭제할까요?`
          }
          onConfirm={() => deleteMutation.mutate({ id: deleteTarget.id, source: deleteTarget.source })}
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
    importGoogle: () => importGoogleMutation.mutate(),
    importingGoogle: importGoogleMutation.isPending,
    modals,
  };
}
