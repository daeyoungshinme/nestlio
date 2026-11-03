import { describe, expect, it } from "vitest";
import { filterTodosByAssignee, isTodoOverdue, todoDueLabel } from "@/utils/todos";
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

  it("나와 배우자 양쪽에 공동 할일이 포함된다", () => {
    expect(filterTodosByAssignee(all, "나", me.id)).toEqual([mine, shared]);
    expect(filterTodosByAssignee(all, "배우자", me.id)).toEqual([theirs, shared]);
  });
});

describe("todoDueLabel", () => {
  const today = "2026-07-10";

  it("기한이 없으면 표시하지 않는다", () => {
    expect(todoDueLabel(todo(), today)).toBeNull();
  });

  it("기한 경계를 구분한다", () => {
    expect(todoDueLabel(todo({ due_date: "2026-07-09" }), today)).toBe("기한 지남 2026.07.09");
    expect(todoDueLabel(todo({ due_date: "2026-07-10" }), today)).toBe("오늘까지");
    expect(todoDueLabel(todo({ due_date: "2026-07-11" }), today)).toBe("2026.07.11까지");
  });

  it("완료한 할일은 기한이 지나도 지남으로 표시하지 않는다", () => {
    const done = todo({ due_date: "2026-07-01", completed_at: "2026-07-02T09:00:00" });
    expect(isTodoOverdue(done, today)).toBe(false);
    expect(todoDueLabel(done, today)).toBe("2026.07.01까지");
  });
});
