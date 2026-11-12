import { describe, expect, it } from "vitest";
import {
  completionProgressLabel,
  filterTodosByAssignee,
  isCheckedBy,
  isMyTurn,
  sortOpenTodos,
  todoDueLabel,
  todoUrgency,
  todoUrgencyLabel,
} from "@/utils/todos";
import type { TodoOut, UserOut } from "@/types";

const me = { id: "me", display_name: "나" } as UserOut;
const partner = { id: "partner", display_name: "배우자" } as UserOut;

function todo(overrides: Partial<TodoOut> = {}): TodoOut {
  return {
    id: 1,
    title: "할일",
    memo: null,
    due_date: null,
    frequency: "once",
    creator: me,
    assignee: null,
    each_completes: false,
    completions: [],
    is_important: false,
    completed_at: null,
    completer: null,
    created_at: "2026-07-01T09:00:00",
    ...overrides,
  };
}

describe("filterTodosByAssignee", () => {
  const mine = todo({ id: 1, assignee: me });
  const theirs = todo({ id: 2, assignee: partner });
  const shared = todo({ id: 3 });
  const all = [mine, theirs, shared];

  it("전체는 모두 보여준다", () => {
    expect(filterTodosByAssignee(all, "전체", me.id)).toEqual(all);
  });

  it("나·배우자·공동은 서로 겹치지 않는다", () => {
    expect(filterTodosByAssignee(all, "나", me.id)).toEqual([mine]);
    expect(filterTodosByAssignee(all, "배우자", me.id)).toEqual([theirs]);
    expect(filterTodosByAssignee(all, "공동", me.id)).toEqual([shared]);
  });

  it("각자 완료 할일은 두 사람 모두의 일이라 나·배우자·공동 모두에 나온다", () => {
    const each = todo({ id: 4, each_completes: true });
    const withEach = [...all, each];
    expect(filterTodosByAssignee(withEach, "나", me.id)).toEqual([mine, each]);
    expect(filterTodosByAssignee(withEach, "배우자", me.id)).toEqual([theirs, each]);
    expect(filterTodosByAssignee(withEach, "공동", me.id)).toEqual([shared, each]);
  });

  it("내 id를 모르면 나·배우자는 비우고 공동은 보여준다", () => {
    expect(filterTodosByAssignee(all, "나", undefined)).toEqual([]);
    expect(filterTodosByAssignee(all, "배우자", undefined)).toEqual([]);
    expect(filterTodosByAssignee(all, "공동", undefined)).toEqual([shared]);
  });
});

describe("각자 완료", () => {
  const each = (doneBy: UserOut[], completed_at: string | null = null) =>
    todo({
      each_completes: true,
      completions: doneBy.map((user) => ({ user, completed_at: "2026-07-01T09:00:00" })),
      completed_at,
    });

  it("체크박스는 내 몫 기준이고, 다 끝난 할일은 모두에게 체크로 보인다", () => {
    expect(isCheckedBy(each([partner]), me.id)).toBe(false);
    expect(isCheckedBy(each([me]), me.id)).toBe(true);
    expect(isCheckedBy(each([me, partner], "2026-07-02T09:00:00"), partner.id)).toBe(true);
    expect(isCheckedBy(each([me]), undefined)).toBe(false);
  });

  it("보통 할일은 전체 완료 여부만 본다", () => {
    expect(isCheckedBy(todo(), me.id)).toBe(false);
    expect(isCheckedBy(todo({ completed_at: "2026-07-02T09:00:00" }), me.id)).toBe(true);
  });

  it("내 차례는 진행 중이고 내 몫이 남은 각자 완료 할일에만", () => {
    expect(isMyTurn(each([partner]), me.id)).toBe(true);
    expect(isMyTurn(each([me]), me.id)).toBe(false);
    expect(isMyTurn(each([me, partner], "2026-07-02T09:00:00"), me.id)).toBe(false);
    expect(isMyTurn(todo(), me.id)).toBe(false);
    expect(isMyTurn(each([]), undefined)).toBe(false);
  });

  it("진행 라벨은 진행 중인 각자 완료 할일에만, 두 사람일 때만 붙는다", () => {
    expect(completionProgressLabel(each([me]), [me, partner])).toBe("나 완료 · 배우자 대기");
    expect(completionProgressLabel(each([]), [me, partner])).toBe("나 대기 · 배우자 대기");
    expect(completionProgressLabel(each([me, partner], "2026-07-02T09:00:00"), [me, partner])).toBeNull();
    expect(completionProgressLabel(each([me]), [me])).toBeNull();
    expect(completionProgressLabel(todo(), [me, partner])).toBeNull();
  });
});

describe("기한 긴급도", () => {
  const today = "2026-07-10";
  const due = (due_date: string | null, extra: Partial<TodoOut> = {}) => todo({ due_date, ...extra });

  it("기한 지남·오늘·3일 이내만 긴급하고 4일 뒤는 아니다", () => {
    expect(todoUrgency(due("2026-07-09"), today)).toBe("overdue");
    expect(todoUrgency(due("2026-07-10"), today)).toBe("today");
    expect(todoUrgency(due("2026-07-13"), today)).toBe("soon");
    expect(todoUrgency(due("2026-07-14"), today)).toBeNull();
    expect(todoUrgency(due(null), today)).toBeNull();
  });

  it("배지 문구", () => {
    expect(todoUrgencyLabel(due("2026-07-09"), today)).toBe("기한 지남");
    expect(todoUrgencyLabel(due("2026-07-10"), today)).toBe("오늘까지");
    expect(todoUrgencyLabel(due("2026-07-12"), today)).toBe("D-2");
    expect(todoUrgencyLabel(due("2026-07-14"), today)).toBeNull();
  });

  it("완료한 할일은 기한이 지나도 긴급하지 않고 날짜만 표시한다", () => {
    const done = due("2026-07-01", { completed_at: "2026-07-02T09:00:00" });
    expect(todoUrgency(done, today)).toBeNull();
    expect(todoDueLabel(done)).toBe("2026.07.01까지");
    expect(todoDueLabel(due(null))).toBeNull();
  });

  it("정렬은 긴급도 → 중요 → 서버 순서", () => {
    const later = due("2026-07-20", { id: 1 });
    const laterImportant = due("2026-07-25", { id: 2, is_important: true });
    const noDue = due(null, { id: 3 });
    const soon = due("2026-07-12", { id: 4 });
    const overdue = due("2026-07-01", { id: 5 });
    const todayImportant = due("2026-07-10", { id: 6, is_important: true });
    const todayPlain = due("2026-07-10", { id: 7 });

    const sorted = sortOpenTodos([later, laterImportant, noDue, soon, overdue, todayPlain, todayImportant], today);
    expect(sorted.map((t) => t.id)).toEqual([5, 6, 7, 4, 2, 1, 3]);
  });
});
