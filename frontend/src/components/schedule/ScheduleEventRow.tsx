import RowActionButtons from "@/components/common/RowActionButtons";
import StatusBadge from "@/components/common/StatusBadge";
import { googleImportedEventBadgeStyle } from "@/utils/colors";
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

/** 일정 카드 한 줄(완료 체크박스 + 제목 + 반복·담당자·구글캘린더 배지 + 시간/장소 + 수정삭제 버튼).
 * ScheduleEventList(날짜 모달)와 ScheduleMonthList(캘린더 아래 월간 목록)가 공유한다. */
export default function ScheduleEventRow({ event, onEdit, onDelete, onToggleComplete, readOnly = false }: Props) {
  const time = occurrenceTime(event.occurrence_start);
  const completed = event.completed_at != null;

  return (
    <div className="card flex items-center justify-between gap-3">
      <div className="min-w-0 flex items-start gap-2">
        <input
          type="checkbox"
          checked={completed}
          onChange={() => onToggleComplete(event)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300"
          aria-label={`${event.title} 완료 처리`}
        />
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
            <StatusBadge
              label={event.creator.display_name}
              toneClassName="bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
            />
            <StatusBadge
              label={`담당 ${event.assignee?.display_name ?? "공동"}`}
              toneClassName="bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
            />
            {event.source === "google_import" && (
              <StatusBadge label="Google 캘린더" toneClassName={googleImportedEventBadgeStyle()} />
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {event.all_day ? "종일" : time}
            {event.location ? ` · ${event.location}` : ""}
          </p>
        </div>
      </div>
      {!readOnly && (
        <RowActionButtons
          onEdit={event.source !== "google_import" && onEdit ? () => onEdit(event) : undefined}
          onDelete={onDelete ? () => onDelete(event) : undefined}
        />
      )}
    </div>
  );
}
