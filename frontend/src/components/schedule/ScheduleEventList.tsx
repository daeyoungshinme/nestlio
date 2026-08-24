import type { ReactNode } from "react";
import { CalendarDays, Plus, Repeat } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import ScheduleEventRow from "@/components/schedule/ScheduleEventRow";
import { formatKrw } from "@/utils/format";
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

/** 일정 목록 렌더링(추가 버튼 + 반복 내역 예정 카드 + 일정 카드) - 가계부(LedgerDayModal)의
 * "일정" 탭과 독립 일정 페이지(SchedulePage)의 날짜별 모달이 공유한다. */
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

      {recurringDue.length > 0 && (
        <div className="space-y-2">
          {recurringDue.map((recurring) => (
            <div key={recurring.id} className="card flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <Repeat size={14} className="shrink-0 text-indigo-500" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{recurring.name}</p>
                <StatusBadge
                  label="반복 내역 예정"
                  toneClassName="bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400"
                  className="shrink-0"
                />
              </div>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">
                {formatKrw(recurring.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

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
