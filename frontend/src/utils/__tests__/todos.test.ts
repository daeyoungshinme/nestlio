import { describe, expect, it } from "vitest";
import {
  completionProgressLabel,
  filterTodosByAssignee,
  isCheckedBy,
  isTodoOverdue,
  todoDueLabel,
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

  it("진행 라벨은 진행 중인 각자 완료 할일에만, 두 사람일 때만 붙는다", () => {
    expect(completionProgressLabel(each([me]), [me, partner])).toBe("나 완료 · 배우자 대기");
    expect(completionProgressLabel(each([]), [me, partner])).toBe("나 대기 · 배우자 대기");
    expect(completionProgressLabel(each([me, partner], "2026-07-02T09:00:00"), [me, partner])).toBeNull();
    expect(completionProgressLabel(each([me]), [me])).toBeNull();
    expect(completionProgressLabel(todo(), [me, partner])).toBeNull();
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
