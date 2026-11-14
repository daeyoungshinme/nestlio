import CompleteCheckbox from "@/components/common/CompleteCheckbox";
import { Link } from "react-router-dom";
import { CalendarDays, Plus } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import StatusBadge from "@/components/common/StatusBadge";
import { useEvents } from "@/hooks/useScheduleQueries";
import { useEventActions } from "@/hooks/useEventActions";
import { ROUTES } from "@/constants/routes";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { assigneeBadgeClass } from "@/utils/colors";
import { occurrenceDate, shiftDateIso } from "@/utils/date";
import { formatDate, formatKrw } from "@/utils/format";
import type { UserOut } from "@/types";

interface Props {
  day: string;
  users: UserOut[] | undefined;
}

const UPCOMING_DAYS = 7;
const UPCOMING_RECURRING_LIMIT = 3;
/** 홈은 요약만 — 오늘 일정이 많으면 3개까지만 보이고 나머지는 가계부 일정 보기로 보낸다. */
const TODAY_EVENTS_LIMIT = 3;

/** 홈의 "오늘 일정 · 다가오는 고정지출" 위젯 - 오늘 하루의 Event 목록(완료 체크·빠른 추가)과 앞으로 7일 안에
 * 나갈/들어올 반복 거래를 한 카드에 보여준다. 한 번의 events(오늘, 오늘+6) 범위 조회 응답에서 오늘 일정은
 * occurrence 날짜로 거르고, 반복 거래 예정은 같은 응답의 recurring_due를 쓴다(별도 요청 없음). */
export default function TodayScheduleCard({ day, users }: Props) {
  const rangeEnd = shiftDateIso(day, UPCOMING_DAYS - 1);
  const eventsQuery = useEvents(day, rangeEnd);
  const data = eventsQuery.data;

  // 추가 폼·완료 토글은 가계부의 일정 보기와 같은 훅을 쓴다(토스트·무효화 규칙 공유).
  const { openCreate, toggleComplete, modals } = useEventActions({ users });

  const todayEvents = (data?.items ?? []).filter((event) => occurrenceDate(event.occurrence_start) === day);
  const events = todayEvents.slice(0, TODAY_EVENTS_LIMIT);
  const hiddenEventCount = todayEvents.length - events.length;
  const upcomingRecurring = (data?.recurring_due ?? [])
    .filter((r) => r.next_due_date >= day && r.next_due_date <= rangeEnd)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
    .slice(0, UPCOMING_RECURRING_LIMIT);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">오늘 일정</span>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => openCreate(day)}>
          일정 추가
        </Button>
      </div>

      <QueryBoundary
        query={eventsQuery}
        compact
        errorMessage="일정을 불러오지 못했어요."
        loadingFallback={<SkeletonCard rows={2} bare />}
      >
        {() =>
          events.length === 0 ? (
            <EmptyState icon={CalendarDays} title="오늘 등록된 일정이 없어요" compact />
          ) : (
            <div className="space-y-2">
              {events.map((event) => {
                const completed = event.completed_at != null;
                return (
                  <div key={event.id} className="flex items-center gap-1">
                    <CompleteCheckbox checked={completed} onToggle={() => toggleComplete(event)} title={event.title} />
                    <p
                      className={`min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-50 ${completed ? "line-through text-gray-400 dark:text-gray-500" : ""}`}
                    >
                      {event.title}
                    </p>
                    <StatusBadge
                      label={`담당 ${event.assignee?.display_name ?? "공동"}`}
                      toneClassName={assigneeBadgeClass()}
                    />
                  </div>
                );
              })}
            </div>
          )
        }
      </QueryBoundary>

      {upcomingRecurring.length > 0 && (
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{UPCOMING_DAYS}일 안에 예정된 고정 수입·지출</p>
          {upcomingRecurring.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
                <span className="text-xs text-gray-500 dark:text-gray-400 mr-1.5">{formatDate(r.next_due_date)}</span>
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

      {/* 헤더의 작은 글자 링크 대신 카드 맨 아래 44px 링크 하나 — "N개 더 보기"도 여기로 합쳤다. */}
      <Link
        to={ROUTES.schedule}
        className={`${TOUCH_TARGET_MIN_HEIGHT} -mb-2 flex items-center justify-center border-t border-gray-100 dark:border-gray-800 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline`}
      >
        {hiddenEventCount > 0 ? `오늘 일정 ${hiddenEventCount}개 더 · 전체 일정 보기` : "전체 일정 보기"}
      </Link>

      {modals}
    </div>
  );
}
