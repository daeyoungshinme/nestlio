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
import { STALE_TIME } from "@/constants/queryConfig";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { UserOut } from "@/types";

interface Props {
  day: string;
  users: UserOut[] | undefined;
}

/** 대시보드의 "오늘의 일정" 위젯 - 오늘 하루의 Event 목록을 완료 체크와 함께 보여주고, 빠른 추가와
 * 전체 일정 페이지(/schedule) 링크를 제공한다. 담당자/완료 체크는 가계부 일정 탭과 같은 Event
 * 데이터를 다루므로 별도 리소스 없이 events(day, day) 범위 조회만으로 구성된다. */
export default function TodayScheduleCard({ day, users }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: QUERY_KEYS.events(day, day),
    queryFn: () => fetchEvents(day, day),
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

  const events = data?.items ?? [];

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">오늘의 일정</span>
        <div className="flex items-center gap-3">
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>
            일정 추가
          </Button>
          <Link to="/schedule" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            전체 일정 보기 →
          </Link>
        </div>
      </div>

      {events.length === 0 ? (
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
                  toneClassName="bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
                />
              </div>
            );
          })}
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
