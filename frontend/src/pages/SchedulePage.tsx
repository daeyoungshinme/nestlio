import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ConfirmModal from "@/components/common/ConfirmModal";
import ErrorState from "@/components/common/ErrorState";
import Modal from "@/components/common/Modal";
import MonthPicker, { currentYearMonth } from "@/components/common/MonthPicker";
import SkeletonCard from "@/components/common/SkeletonCard";
import Tabs from "@/components/common/Tabs";
import MonthCalendarGrid from "@/components/transactions/MonthCalendarGrid";
import EventForm, { emptyEventFormValues, eventToFormValues } from "@/components/transactions/EventForm";
import ScheduleDayCell from "@/components/schedule/ScheduleDayCell";
import ScheduleEventList from "@/components/schedule/ScheduleEventList";
import ScheduleMonthList from "@/components/schedule/ScheduleMonthList";
import { completeEvent, createEvent, deleteEvent, fetchEvents, updateEvent } from "@/api/events";
import { fetchUsers } from "@/api/users";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { extractErrorMessage } from "@/utils/error";
import { formatDate } from "@/utils/format";
import { toast } from "@/utils/toast";
import type { EventOut } from "@/types";

const ALL_ASSIGNEES_TAB = "전체";
const SHARED_ASSIGNEE_TAB = "공동";

function monthBounds(yearMonth: string): { date_from: string; date_to: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { date_from: `${yearMonth}-01`, date_to: `${yearMonth}-${String(lastDay).padStart(2, "0")}` };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function occurrenceDate(iso: string): string {
  return iso.split("T")[0];
}

export default function SchedulePage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [assigneeTab, setAssigneeTab] = useState(ALL_ASSIGNEES_TAB);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [createDateHint, setCreateDateHint] = useState(todayIso());
  const [formTarget, setFormTarget] = useState<"new" | EventOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventOut | null>(null);
  const queryClient = useQueryClient();

  const { date_from, date_to } = monthBounds(yearMonth);

  const { data: users } = useQuery({ queryKey: QUERY_KEYS.users, queryFn: fetchUsers, staleTime: STALE_TIME.LONG });
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEYS.events(date_from, date_to),
    queryFn: () => fetchEvents(date_from, date_to),
    staleTime: STALE_TIME.SHORT,
  });

  const invalidateEvents = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsAll });

  const createMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      invalidateEvents();
      setFormTarget(null);
      toast("일정을 등록했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateEvent>[1] }) =>
      updateEvent(id, payload),
    onSuccess: () => {
      invalidateEvents();
      setFormTarget(null);
      toast("일정을 수정했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

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

  if (isError) {
    return (
      <ErrorState message={extractErrorMessage(error, "일정을 불러오지 못했습니다.")} onRetry={() => void refetch()} />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <SkeletonCard rows={2} />
        <SkeletonCard rows={6} />
      </div>
    );
  }

  const assigneeTabs = [ALL_ASSIGNEES_TAB, ...(users?.map((u) => u.display_name) ?? []), SHARED_ASSIGNEE_TAB];
  const assigneeFilterId =
    assigneeTab === ALL_ASSIGNEES_TAB
      ? undefined
      : assigneeTab === SHARED_ASSIGNEE_TAB
        ? null
        : users?.find((u) => u.display_name === assigneeTab)?.id;

  const filteredEvents =
    assigneeTab === ALL_ASSIGNEES_TAB ? data.items : data.items.filter((e) => (e.assignee?.id ?? null) === assigneeFilterId);

  const eventsByDate = new Map<string, EventOut[]>();
  for (const event of filteredEvents) {
    const date = occurrenceDate(event.occurrence_start);
    const list = eventsByDate.get(date) ?? [];
    list.push(event);
    eventsByDate.set(date, list);
  }

  const dayEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

  const openCreate = () => {
    setCreateDateHint(selectedDate ?? todayIso());
    setSelectedDate(null);
    setFormTarget("new");
  };

  const openEdit = (event: EventOut) => {
    setSelectedDate(null);
    setFormTarget(event);
  };

  const openDelete = (event: EventOut) => {
    setSelectedDate(null);
    setDeleteTarget(event);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">일정</h1>
        <MonthPicker yearMonth={yearMonth} onChange={setYearMonth} />
      </div>

      <Tabs tabs={assigneeTabs} activeTab={assigneeTab} onChange={setAssigneeTab} variant="pill" />

      <MonthCalendarGrid
        yearMonth={yearMonth}
        renderCell={(cell) => (
          <ScheduleDayCell
            {...cell}
            events={eventsByDate.get(cell.date) ?? []}
            onSelect={setSelectedDate}
          />
        )}
      />

      <ScheduleMonthList
        events={filteredEvents}
        onEdit={openEdit}
        onDelete={openDelete}
        onToggleComplete={(event) => completeMutation.mutate({ id: event.id, completed: !event.completed_at })}
      />

      {selectedDate && (
        <Modal onClose={() => setSelectedDate(null)} title={formatDate(selectedDate)}>
          <div className="p-6 overflow-y-auto">
            <ScheduleEventList
              events={dayEvents}
              recurringDue={[]}
              onAdd={openCreate}
              onEdit={openEdit}
              onDelete={openDelete}
              onToggleComplete={(event) => completeMutation.mutate({ id: event.id, completed: !event.completed_at })}
            />
          </div>
        </Modal>
      )}

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
    </div>
  );
}
