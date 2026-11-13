import CompleteCheckbox from "@/components/common/CompleteCheckbox";
import RowActionButtons from "@/components/common/RowActionButtons";
import StatusBadge from "@/components/common/StatusBadge";
import TodoPriorityBadge from "@/components/todos/TodoPriorityBadge";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { todoMyTurnBadgeClass, todoUrgencyBadgeClass } from "@/utils/colors";
import { occurrenceDate } from "@/utils/date";
import { formatDate } from "@/utils/format";
import {
  completionProgressLabel,
  isCheckedBy,
  isMyTurn,
  TODO_FREQUENCY_LABEL,
  todoDueLabel,
  todoUrgency,
  todoUrgencyLabel,
} from "@/utils/todos";
import type { TodoOut, UserOut } from "@/types";

interface Props {
  todo: TodoOut;
  today: string;
  /** 체크박스 상태를 내 몫 기준으로 그린다(각자 완료 할일). */
  myId: string | undefined;
  users: UserOut[] | undefined;
  onEdit: (todo: TodoOut) => void;
  onDelete: (todo: TodoOut) => void;
  onToggleComplete: (todo: TodoOut) => void;
}

/** `/todos`의 할일 한 줄 — 체크박스 + 제목(누르면 수정) + 우선순위·긴급도·내 차례·반복·각자 배지 + 기한·담당·작성자·각자 진행 + 삭제 버튼. */
export default function TodoRow({ todo, today, myId, users, onEdit, onDelete, onToggleComplete }: Props) {
  const completed = todo.completed_at != null;
  const checked = isCheckedBy(todo, myId);
  const dueLabel = todoDueLabel(todo);
  const urgency = todoUrgency(todo, today);
  const urgencyLabel = todoUrgencyLabel(todo, today);

  return (
    <div className="card flex items-center justify-between gap-3">
      <div className="min-w-0 flex flex-1 items-center gap-1">
        <CompleteCheckbox checked={checked} onToggle={() => onToggleComplete(todo)} title={todo.title} />
        <button type="button" onClick={() => onEdit(todo)} className={`min-w-0 flex-1 text-left ${TOUCH_TARGET_MIN_HEIGHT}`}>
          <span className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium text-gray-900 dark:text-gray-50 ${completed ? "line-through text-gray-400 dark:text-gray-500" : ""}`}
            >
              {todo.title}
            </span>
            {!completed && <TodoPriorityBadge priority={todo.priority} />}
            {urgency && urgencyLabel && (
              <StatusBadge label={urgencyLabel} toneClassName={todoUrgencyBadgeClass(urgency)} />
            )}
            {isMyTurn(todo, myId) && <StatusBadge label="내 차례" toneClassName={todoMyTurnBadgeClass()} />}
            {todo.frequency !== "once" && (
              <StatusBadge
                label={TODO_FREQUENCY_LABEL[todo.frequency]}
                toneClassName="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              />
            )}
            {todo.each_completes && (
              <StatusBadge label="각자" toneClassName="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400" />
            )}
          </span>
          <span className="block break-keep text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {[
              dueLabel,
              `담당 ${todo.assignee?.display_name ?? "공동"}`,
              completionProgressLabel(todo, users),
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
