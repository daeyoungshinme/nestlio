import { CalendarDays } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import RecurringDueCards from "@/components/schedule/RecurringDueCards";
import ScheduleEventRow from "@/components/schedule/ScheduleEventRow";
import type { EventOut, RecurringOut } from "@/types";

interface Props {
  events: EventOut[];
  recurringDue: RecurringOut[];
  onEdit?: (event: EventOut) => void;
  onDelete?: (event: EventOut) => void;
  onToggleComplete: (event: EventOut) => void;
}

/** 하루치 일정 목록(반복 내역 예정 카드 + 일정 카드) — 가계부 날짜 상세(LedgerDayDetail)의 "일정" 탭. 추가 버튼은 상세 헤더에 있다. */
export default function ScheduleEventList({
  events,
  recurringDue,
  onEdit,
  onDelete,
  onToggleComplete,
}: Props) {
  return (
    <div className="space-y-4">
      <RecurringDueCards recurringDue={recurringDue} />

      {events.length === 0 ? (
        recurringDue.length === 0 && <EmptyState icon={CalendarDays} title="등록된 일정이 없어요" compact />
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <ScheduleEventRow
              key={event.id}
              event={event}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
