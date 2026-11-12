import { formatDate } from "@/utils/format";
import type { TodoFrequency, TodoOut, UserOut } from "@/types";

export const TODO_FREQUENCY_LABEL: Record<TodoFrequency, string> = {
  once: "반복 안 함",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};

export const TODO_ASSIGNEE_FILTERS = ["전체", "나", "배우자", "공동"] as const;
export type TodoAssigneeFilter = (typeof TODO_ASSIGNEE_FILTERS)[number];

/** 담당 필터 — "나"·"배우자"는 담당자가 정확히 그 사람인 할일만, "공동"은 담당자가 없는 할일만 보여준다.
 * 공동 할일을 나·배우자 양쪽에 넣으면 기본값이 공동이라 두 탭이 거의 같아져 필터가 안 먹는 것처럼 보인다.
 * 내 id를 아직 모르면(로딩 중) 나·배우자는 비워 둔다 — 엉뚱한 항목이 잠깐 섞이지 않게. */
export function filterTodosByAssignee(
  todos: TodoOut[],
  filter: TodoAssigneeFilter,
  myId: string | undefined,
): TodoOut[] {
  if (filter === "전체") return todos;
  if (filter === "공동") return todos.filter((todo) => !todo.assignee);
  if (!myId) return [];
  return todos.filter((todo) => {
    if (!todo.assignee) return false;
    return filter === "나" ? todo.assignee.id === myId : todo.assignee.id !== myId;
  });
}

/** 이 사람 기준 체크박스 상태 — 할일 전체가 끝났으면 체크, 각자 완료 할일이면 내 몫을 체크했는지. */
export function isCheckedBy(todo: TodoOut, userId: string | undefined): boolean {
  if (todo.completed_at != null) return true;
  if (!todo.each_completes || !userId) return false;
  return todo.completions.some((c) => c.user.id === userId);
}

/** 각자 완료 할일의 진행 상황("민수 완료 · 지영 대기"). 끝났거나 혼자인 가구면 표시하지 않는다. */
export function completionProgressLabel(todo: TodoOut, users: UserOut[] | undefined): string | null {
  if (!todo.each_completes || todo.completed_at != null || !users || users.length < 2) return null;
  const done = new Set(todo.completions.map((c) => c.user.id));
  return users.map((u) => `${u.display_name} ${done.has(u.id) ? "완료" : "대기"}`).join(" · ");
}

export function isTodoOverdue(todo: TodoOut, today: string): boolean {
  return todo.completed_at == null && todo.due_date != null && todo.due_date < today;
}

export function todoDueLabel(todo: TodoOut, today: string): string | null {
  if (!todo.due_date) return null;
  if (isTodoOverdue(todo, today)) return `기한 지남 ${formatDate(todo.due_date)}`;
  return todo.due_date === today ? "오늘까지" : `${formatDate(todo.due_date)}까지`;
}
