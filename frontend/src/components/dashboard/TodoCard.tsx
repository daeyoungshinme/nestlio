import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Plus } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import StatusBadge from "@/components/common/StatusBadge";
import TodoPriorityBadge from "@/components/todos/TodoPriorityBadge";
import { fetchTodos } from "@/api/todos";
import { useMe } from "@/hooks/useReferenceData";
import { useTodoActions } from "@/hooks/useTodoActions";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { ROUTES } from "@/constants/routes";
import { TOUCH_TARGET_MIN, TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { todoMyTurnBadgeClass, todoUrgencyBadgeClass } from "@/utils/colors";
import {
  completionProgressLabel,
  isCheckedBy,
  isMyTurn,
  sortOpenTodos,
  todoDueLabel,
  todoUrgency,
  todoUrgencyLabel,
} from "@/utils/todos";
import type { UserOut } from "@/types";

interface Props {
  day: string;
  users: UserOut[] | undefined;
}

/** 홈은 요약만 — 급하고 중요한 순(sortOpenTodos)으로 3개까지만 보이고 나머지는 `/todos`로 보낸다. */
const TODOS_LIMIT = 3;

/** 홈의 "우리 할일" 위젯 — 진행 중인 할일의 완료 체크와 빠른 추가. 기한 임박 알림을 따로 보내지 않는 대신 여기서
 * 기한이 지났거나 오늘·임박인 할일, 중요 할일이 맨 위에 보인다. */
export default function TodoCard({ day, users }: Props) {
  const { data, isError, refetch } = useQuery({
    queryKey: QUERY_KEYS.todos("open"),
    queryFn: () => fetchTodos("open"),
  });
  const { data: me } = useMe();
  const { openCreate, toggleComplete, modals } = useTodoActions({ users });

  const todos = sortOpenTodos(data ?? [], day).slice(0, TODOS_LIMIT);
  const hiddenCount = (data?.length ?? 0) - todos.length;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">우리 할일</span>
        <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>
          할일 추가
        </Button>
      </div>

      {isError ? (
        <button
          type="button"
          onClick={() => void refetch()}
          className="w-full text-left text-sm text-gray-500 dark:text-gray-400 hover:underline min-h-[44px]"
        >
          할일을 불러오지 못했어요. 다시 시도하려면 눌러주세요.
        </button>
      ) : todos.length === 0 ? (
        <EmptyState icon={ListChecks} title="진행 중인 할일이 없어요" compact />
      ) : (
        <div className="space-y-2">
          {todos.map((todo) => {
            const dueLabel = todoDueLabel(todo);
            const urgency = todoUrgency(todo, day);
            const urgencyLabel = todoUrgencyLabel(todo, day);
            const progressLabel = completionProgressLabel(todo, users);
            return (
              <div key={todo.id} className="flex items-center gap-1">
                <label className={`${TOUCH_TARGET_MIN} -ml-3 shrink-0 cursor-pointer`}>
                  <input
                    type="checkbox"
                    checked={isCheckedBy(todo, me?.id)}
                    onChange={() => toggleComplete(todo)}
                    className="h-5 w-5 rounded-sm border-gray-300"
                    aria-label={`${todo.title} 완료 처리`}
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm text-gray-900 dark:text-gray-50">
                    <span className="truncate">{todo.title}</span>
                    <TodoPriorityBadge priority={todo.priority} />
                  </p>
                  {dueLabel && (
                    <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      {urgency && urgencyLabel && (
                        <StatusBadge label={urgencyLabel} toneClassName={todoUrgencyBadgeClass(urgency)} />
                      )}
                      {dueLabel}
                    </p>
                  )}
                  {progressLabel && <p className="text-xs text-gray-500 dark:text-gray-400">{progressLabel}</p>}
                </div>
                {isMyTurn(todo, me?.id) ? (
                  <StatusBadge label="내 차례" toneClassName={todoMyTurnBadgeClass()} />
                ) : (
                  <StatusBadge
                    label={`담당 ${todo.assignee?.display_name ?? "공동"}`}
                    toneClassName="bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <Link
        to={ROUTES.todos}
        className={`${TOUCH_TARGET_MIN_HEIGHT} -mb-2 flex items-center justify-center border-t border-gray-100 dark:border-gray-800 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline`}
      >
        {hiddenCount > 0 ? `할일 ${hiddenCount}개 더 · 전체 할일 보기` : "전체 할일 보기"}
      </Link>

      {modals}
    </div>
  );
}
