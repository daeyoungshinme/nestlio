import type { ReactNode } from "react";
import { CalendarDays, Plus } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import RecurringDueCards from "@/components/schedule/RecurringDueCards";
import ScheduleEventRow from "@/components/schedule/ScheduleEventRow";
import type { EventOut, RecurringOut } from "@/types";

interface Props {
  events: EventOut[];
  recurringDue: RecurringOut[];
  description?: ReactNode;
  onAdd?: () => void;
  onEdit?: (event: EventOut) => void;
  onDelete?: (event: EventOut) => void;
  onToggleComplete: (event: EventOut) => void;
  /** true면 추가 버튼과 각 행의 수정/삭제 버튼을 숨기고 완료 체크만 남긴다. */
  readOnly?: boolean;
}

/** 일정 목록 렌더링(추가 버튼 + 반복 내역 예정 카드 + 일정 카드) - 가계부 날짜 상세(LedgerDayDetail)와 홈 등이 공유한다. */
export default function ScheduleEventList({
  events,
  recurringDue,
  description,
  onAdd,
  onEdit,
  onDelete,
  onToggleComplete,
  readOnly = false,
}: Props) {
  return (
    <div className="space-y-4">
      {onAdd && (
        <Button size="sm" icon={<Plus size={14} />} onClick={onAdd}>
          일정 추가
        </Button>
      )}

      {description}

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
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}
