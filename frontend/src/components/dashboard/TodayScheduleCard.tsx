import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/common/Modal";
import StatusBadge from "@/components/common/StatusBadge";
import EventForm, { emptyEventFormValues } from "@/components/transactions/EventForm";
import { completeEvent, createEvent, fetchEvents } from "@/api/events";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { ROUTES } from "@/constants/routes";
import { STALE_TIME } from "@/constants/queryConfig";
import { occurrenceDate, shiftDateIso } from "@/utils/date";
import { extractErrorMessage } from "@/utils/error";
import { formatDate, formatKrw } from "@/utils/format";
import { toast } from "@/utils/toast";
import type { UserOut } from "@/types";

interface Props {
  day: string;
  users: UserOut[] | undefined;
}

const UPCOMING_DAYS = 7;
const UPCOMING_RECURRING_LIMIT = 3;

/** 홈의 "오늘 일정 · 다가오는 고정지출" 위젯 - 오늘 하루의 Event 목록(완료 체크·빠른 추가)과 앞으로 7일 안에
 * 나갈/들어올 반복 거래를 한 카드에 보여준다. 한 번의 events(오늘, 오늘+6) 범위 조회 응답에서 오늘 일정은
 * occurrence 날짜로 거르고, 반복 거래 예정은 같은 응답의 recurring_due를 쓴다(별도 요청 없음). */
export default function TodayScheduleCard({ day, users }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();

  const rangeEnd = shiftDateIso(day, UPCOMING_DAYS - 1);
  const { data, isError, refetch } = useQuery({
    queryKey: QUERY_KEYS.events(day, rangeEnd),
    queryFn: () => fetchEvents(day, rangeEnd),
    staleTime: STALE_TIME.SHORT,
  });

  const invalidateEvents = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsAll });

  const createMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      invalidateEvents();
      setShowAdd(false);
      toast("일정을 등록했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) => completeEvent(id, completed),
    onSuccess: invalidateEvents,
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const events = (data?.items ?? []).filter((event) => occurrenceDate(event.occurrence_start) === day);
  const upcomingRecurring = (data?.recurring_due ?? [])
    .filter((r) => r.next_due_date >= day && r.next_due_date <= rangeEnd)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
    .slice(0, UPCOMING_RECURRING_LIMIT);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">오늘 일정</span>
        <div className="flex items-center gap-3">
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>
            일정 추가
          </Button>
          <Link to={ROUTES.schedule} className="text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline">
            전체 일정 보기 →
          </Link>
        </div>
      </div>

      {isError ? (
        <button
          type="button"
          onClick={() => void refetch()}
          className="w-full text-left text-sm text-gray-500 dark:text-gray-400 hover:underline min-h-[44px]"
        >
          일정을 불러오지 못했어요. 다시 시도하려면 눌러주세요.
        </button>
      ) : events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="오늘 등록된 일정이 없어요" compact />
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const completed = event.completed_at != null;
            return (
              <div key={event.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={completed}
                  onChange={() => completeMutation.mutate({ id: event.id, completed: !completed })}
                  className="h-4 w-4 shrink-0 rounded border-gray-300"
                  aria-label={`${event.title} 완료 처리`}
                />
                <p
                  className={`min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-50 ${completed ? "line-through text-gray-400 dark:text-gray-500" : ""}`}
                >
                  {event.title}
                </p>
                <StatusBadge
                  label={`담당 ${event.assignee?.display_name ?? "공동"}`}
                  toneClassName="bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400"
                />
              </div>
            );
          })}
        </div>
      )}

      {upcomingRecurring.length > 0 && (
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{UPCOMING_DAYS}일 안에 예정된 고정 수입·지출</p>
          {upcomingRecurring.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
                <span className="text-xs text-gray-400 dark:text-gray-500 mr-1.5">{formatDate(r.next_due_date)}</span>
                {r.name}
              </span>
              <span className="shrink-0 font-medium text-gray-900 dark:text-gray-50">
                {r.type === "income" ? "+" : "-"}
                {formatKrw(r.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)} title="새 일정">
          <div className="p-6 overflow-y-auto">
            <EventForm
              initialValues={emptyEventFormValues(day)}
              submitLabel="추가"
              submitting={createMutation.isPending}
              users={users}
              onSubmit={(payload) => createMutation.mutate(payload)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
