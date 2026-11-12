import type { TodoUrgency } from "@/utils/colors";
import { shiftDateIso } from "@/utils/date";
import { formatDate } from "@/utils/format";
import type { TodoFrequency, TodoOut, TodoPriority, UserOut } from "@/types";

export const TODO_FREQUENCY_LABEL: Record<TodoFrequency, string> = {
  once: "반복 안 함",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};

/** 폼 옵션 순서도 이 키 순서를 따른다. */
export const TODO_PRIORITY_LABEL: Record<TodoPriority, string> = {
  urgent: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
};

export const TODO_ASSIGNEE_FILTERS = ["전체", "나", "배우자", "공동"] as const;
export type TodoAssigneeFilter = (typeof TODO_ASSIGNEE_FILTERS)[number];

/** 담당 필터 — "나"·"배우자"는 담당자가 정확히 그 사람인 할일만, "공동"은 담당자가 없는 할일만 보여준다.
 * 공동 할일을 나·배우자 양쪽에 넣으면 기본값이 공동이라 두 탭이 거의 같아져 필터가 안 먹는 것처럼 보인다.
 * 예외: 각자 완료 할일은 두 사람이 각각 해야 하는 일이라 나·배우자·공동 모두에 넣는다(안 그러면 "나" 탭만 보는
 * 사람이 놓친다). 내 id를 아직 모르면(로딩 중) 나·배우자는 비워 둔다 — 엉뚱한 항목이 잠깐 섞이지 않게. */
export function filterTodosByAssignee(
  todos: TodoOut[],
  filter: TodoAssigneeFilter,
  myId: string | undefined,
): TodoOut[] {
  if (filter === "전체") return todos;
  if (filter === "공동") return todos.filter((todo) => !todo.assignee);
  if (!myId) return [];
  return todos.filter((todo) => {
    if (todo.each_completes) return true;
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

/** 각자 완료 할일인데 아직 진행 중이고 내 몫이 남았으면 true — "내 차례" 배지. */
export function isMyTurn(todo: TodoOut, myId: string | undefined): boolean {
  return todo.each_completes && todo.completed_at == null && !!myId && !isCheckedBy(todo, myId);
}

/** 메타 줄의 기한 문구("2026.07.10까지"). 기한 지남·오늘·임박 강조는 todoUrgencyLabel 배지가 맡는다. */
export function todoDueLabel(todo: TodoOut): string | null {
  return todo.due_date ? `${formatDate(todo.due_date)}까지` : null;
}

/** 기한이 오늘부터 이 일수 안이면 "임박"(D-n 배지). */
export const TODO_SOON_DAYS = 3;

/** 진행 중 할일의 기한 긴급도 — 기한 지남 / 오늘 / TODO_SOON_DAYS일 이내. 완료됐거나 기한이 없거나 여유 있으면 null. */
export function todoUrgency(todo: TodoOut, today: string): TodoUrgency | null {
  if (todo.completed_at != null || !todo.due_date) return null;
  if (todo.due_date < today) return "overdue";
  if (todo.due_date === today) return "today";
  return todo.due_date <= shiftDateIso(today, TODO_SOON_DAYS) ? "soon" : null;
}

/** 긴급도 배지 문구. soon이면 "D-2"처럼 남은 날수. */
export function todoUrgencyLabel(todo: TodoOut, today: string): string | null {
  const urgency = todoUrgency(todo, today);
  if (urgency === "overdue") return "기한 지남";
  if (urgency === "today") return "오늘까지";
  if (urgency === "soon" && todo.due_date) {
    for (let d = 1; d <= TODO_SOON_DAYS; d += 1) {
      if (shiftDateIso(today, d) === todo.due_date) return `D-${d}`;
    }
  }
  return null;
}

const URGENCY_RANK: Record<TodoUrgency, number> = { overdue: 0, today: 1, soon: 2 };
const PRIORITY_RANK: Record<TodoPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** 진행 중 할일을 "무엇부터 할지" 순으로 — 우선순위 "긴급"은 기한과 상관없이 맨 위, 그다음 기한 긴급도(기한 지남 →
 * 오늘 → 임박 → 나머지) → 우선순위(높음 → 보통 → 낮음) → 서버 순서(기한 오름차순, 기한 없음은 뒤).
 * 완료 탭은 최근 완료순이라 쓰지 않는다. */
export function sortOpenTodos(todos: TodoOut[], today: string): TodoOut[] {
  const rank = (todo: TodoOut) => {
    const urgency = todoUrgency(todo, today);
    return urgency ? URGENCY_RANK[urgency] : 3;
  };
  return todos
    .map((todo, index) => ({ todo, index }))
    .sort(
      (a, b) =>
        Number(b.todo.priority === "urgent") - Number(a.todo.priority === "urgent") ||
        rank(a.todo) - rank(b.todo) ||
        PRIORITY_RANK[a.todo.priority] - PRIORITY_RANK[b.todo.priority] ||
        a.index - b.index,
    )
    .map(({ todo }) => todo);
}
