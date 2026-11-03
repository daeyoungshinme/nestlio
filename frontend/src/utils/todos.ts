import { formatDate } from "@/utils/format";
import type { TodoFrequency, TodoOut } from "@/types";

export const TODO_FREQUENCY_LABEL: Record<TodoFrequency, string> = {
  once: "반복 안 함",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};

export const TODO_ASSIGNEE_FILTERS = ["전체", "나", "배우자"] as const;
export type TodoAssigneeFilter = (typeof TODO_ASSIGNEE_FILTERS)[number];

/** 담당 필터 — 공동 할일은 두 사람 모두의 할일이므로 "나"와 "배우자" 양쪽에 다 나온다. */
export function filterTodosByAssignee(
  todos: TodoOut[],
  filter: TodoAssigneeFilter,
  myId: string | undefined,
): TodoOut[] {
  if (filter === "전체") return todos;
  return todos.filter((todo) => {
    if (!todo.assignee) return true;
    return filter === "나" ? todo.assignee.id === myId : todo.assignee.id !== myId;
  });
}

export function isTodoOverdue(todo: TodoOut, today: string): boolean {
  return todo.completed_at == null && todo.due_date != null && todo.due_date < today;
}

export function todoDueLabel(todo: TodoOut, today: string): string | null {
  if (!todo.due_date) return null;
  if (isTodoOverdue(todo, today)) return `기한 지남 ${formatDate(todo.due_date)}`;
  return todo.due_date === today ? "오늘까지" : `${formatDate(todo.due_date)}까지`;
}
