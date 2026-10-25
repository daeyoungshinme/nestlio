import { useMemo } from "react";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import EmptyState from "@/components/common/EmptyState";
import ScheduleEventRow from "@/components/schedule/ScheduleEventRow";
import { currentDateIso, formatDayHeader, occurrenceDate } from "@/utils/date";
import type { EventOut } from "@/types";

interface Props {
  /** 이미 담당자 필터가 적용되고 occurrence_start 오름차순으로 정렬된 상태로 전달받는다
   * (백엔드 list_events가 오름차순으로 내려주므로 별도 재정렬 불필요). */
  events: EventOut[];
  onEdit: (event: EventOut) => void;
  onDelete: (event: EventOut) => void;
  onToggleComplete: (event: EventOut) => void;
}

/** 한 달 일정이 이 이하면 전부 펼친다. */
const EXPAND_ALL_MAX_EVENTS = 20;
/** 그보다 많으면 오늘 이후 가장 가까운 며칠만 펼친다(오늘 이후가 없으면 첫 며칠). */
const UPCOMING_OPEN_DAYS = 3;

/** 캘린더 아래에 이번 달 일정을 날짜별 접이식 목록으로 보여준다 - 가계부(/transactions)의
 * DailyTransactionGroups와 동일한 패턴. 일정은 날짜 오름차순이라 "다가오는 며칠"을 펼친다. */
export default function ScheduleMonthList({ events, onEdit, onDelete, onToggleComplete }: Props) {
  const today = currentDateIso();

  const groups = useMemo(() => {
    const byDate = new Map<string, EventOut[]>();
    for (const event of events) {
      const date = occurrenceDate(event.occurrence_start);
      const list = byDate.get(date) ?? [];
      list.push(event);
      byDate.set(date, list);
    }
    const entries = Array.from(byDate.entries());
    const expandAll = events.length <= EXPAND_ALL_MAX_EVENTS;
    const firstUpcoming = entries.findIndex(([date]) => date >= today);
    const openFrom = firstUpcoming === -1 ? 0 : firstUpcoming;
    return entries.map(([date, dayEvents], index) => ({
      date,
      dayEvents,
      defaultOpen: expandAll || (index >= openFrom && index < openFrom + UPCOMING_OPEN_DAYS),
    }));
  }, [events, today]);

  if (groups.length === 0) {
    return <EmptyState title="이번 달 등록된 일정이 없어요" compact />;
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <CollapsibleGroup
          key={group.date}
          amount={`${group.dayEvents.length}건`}
          defaultOpen={group.defaultOpen}
          header={
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
              {formatDayHeader(group.date)}
            </span>
          }
        >
          {group.dayEvents.map((event) => (
            <ScheduleEventRow
              key={event.id}
              event={event}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </CollapsibleGroup>
      ))}
    </div>
  );
}
