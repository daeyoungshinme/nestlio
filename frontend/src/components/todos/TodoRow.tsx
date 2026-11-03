import RowActionButtons from "@/components/common/RowActionButtons";
import StatusBadge from "@/components/common/StatusBadge";
import { TOUCH_TARGET_MIN } from "@/constants/uiSizes";
import { cautionTextClass } from "@/utils/colors";
import { occurrenceDate } from "@/utils/date";
import { formatDate } from "@/utils/format";
import { isTodoOverdue, TODO_FREQUENCY_LABEL, todoDueLabel } from "@/utils/todos";
import type { TodoOut } from "@/types";

interface Props {
  todo: TodoOut;
  today: string;
  onEdit: (todo: TodoOut) => void;
  onDelete: (todo: TodoOut) => void;
  onToggleComplete: (todo: TodoOut) => void;
}

/** `/todos`의 할일 한 줄 — 체크박스 + 제목(누르면 수정) + 반복 배지 + 기한·담당·작성자 + 삭제 버튼. */
export default function TodoRow({ todo, today, onEdit, onDelete, onToggleComplete }: Props) {
  const completed = todo.completed_at != null;
  const dueLabel = todoDueLabel(todo, today);

  return (
    <div className="card flex items-center justify-between gap-3">
      <div className="min-w-0 flex flex-1 items-center gap-1">
        <label className={`${TOUCH_TARGET_MIN} -ml-3 shrink-0 cursor-pointer`}>
          <input
            type="checkbox"
            checked={completed}
            onChange={() => onToggleComplete(todo)}
            className="h-5 w-5 rounded border-gray-300"
            aria-label={`${todo.title} 완료 처리`}
          />
        </label>
        <button type="button" onClick={() => onEdit(todo)} className="min-w-0 flex-1 text-left min-h-[44px]">
          <span className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium text-gray-900 dark:text-gray-50 ${completed ? "line-through text-gray-400 dark:text-gray-500" : ""}`}
            >
              {todo.title}
            </span>
            {todo.frequency !== "once" && (
              <StatusBadge
                label={TODO_FREQUENCY_LABEL[todo.frequency]}
                toneClassName="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              />
            )}
          </span>
          <span className="block break-keep text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {dueLabel && (
              <span className={isTodoOverdue(todo, today) ? `font-medium ${cautionTextClass()}` : undefined}>
                {dueLabel} ·{" "}
              </span>
            )}
            {[
              `담당 ${todo.assignee?.display_name ?? "공동"}`,
              todo.assignee?.id === todo.creator.id ? null : `작성 ${todo.creator.display_name}`,
              todo.completed_at
                ? `${todo.completer?.display_name ?? ""} 완료 ${formatDate(occurrenceDate(todo.completed_at))}`.trim()
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
      </div>
      <RowActionButtons onDelete={() => onDelete(todo)} />
    </div>
  );
}
