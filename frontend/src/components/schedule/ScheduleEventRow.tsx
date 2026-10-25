import RowActionButtons from "@/components/common/RowActionButtons";
import StatusBadge from "@/components/common/StatusBadge";
import { TOUCH_TARGET_MIN } from "@/constants/uiSizes";
import type { EventFrequency, EventOut } from "@/types";

const FREQUENCY_LABEL: Record<EventFrequency, string> = { once: "한 번", weekly: "매주", monthly: "매월" };

function occurrenceTime(iso: string): string {
  const timePart = iso.split("T")[1];
  return timePart ? timePart.slice(0, 5) : "";
}

interface Props {
  event: EventOut;
  onEdit?: (event: EventOut) => void;
  onDelete?: (event: EventOut) => void;
  onToggleComplete: (event: EventOut) => void;
  /** true면 수정/삭제 버튼을 숨기고 완료 체크만 남긴다 (가계부 일별 모달의 읽기 전용 미리보기용). */
  readOnly?: boolean;
}

/** 일정 카드 한 줄(완료 체크박스 + 제목 + 반복 배지 + 시간·장소·담당 + 수정삭제 버튼).
 * ScheduleEventList(날짜 모달)와 ScheduleMonthList(캘린더 아래 월간 목록)가 공유한다. */
export default function ScheduleEventRow({ event, onEdit, onDelete, onToggleComplete, readOnly = false }: Props) {
  const time = occurrenceTime(event.occurrence_start);
  const completed = event.completed_at != null;

  return (
    <div className="card flex items-center justify-between gap-3">
      <div className="min-w-0 flex items-center gap-1">
        {/* 체크박스 자체는 작아도 감싼 label이 44px라 엄지로 누르기 쉽다. */}
        <label className={`${TOUCH_TARGET_MIN} -ml-3 shrink-0 cursor-pointer`}>
          <input
            type="checkbox"
            checked={completed}
            onChange={() => onToggleComplete(event)}
            className="h-5 w-5 rounded border-gray-300"
            aria-label={`${event.title} 완료 처리`}
          />
        </label>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className={`text-sm font-medium text-gray-900 dark:text-gray-50 ${completed ? "line-through text-gray-400 dark:text-gray-500" : ""}`}
            >
              {event.title}
            </p>
            {event.frequency !== "once" && (
              <StatusBadge
                label={FREQUENCY_LABEL[event.frequency]}
                toneClassName="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              />
            )}
          </div>
          {/* 작성자·담당 배지 2개가 제목 줄을 감싸던 것을 보조 줄 글자로 — 작성자는 담당과 다를 때만. */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {[
              event.all_day ? "종일" : time,
              event.location,
              `담당 ${event.assignee?.display_name ?? "공동"}`,
              event.assignee && event.assignee.id === event.creator.id ? null : `작성 ${event.creator.display_name}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {!readOnly && (
        <RowActionButtons
          onEdit={onEdit ? () => onEdit(event) : undefined}
          onDelete={onDelete ? () => onDelete(event) : undefined}
        />
      )}
    </div>
  );
}
