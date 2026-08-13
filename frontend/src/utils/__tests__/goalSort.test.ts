import { describe, expect, it } from "vitest";
import { sortGoals } from "@/utils/goalSort";
import type { FinancialGoalOut } from "@/types";

function makeGoal(overrides: Partial<FinancialGoalOut>): FinancialGoalOut {
  return {
    id: 1,
    kind: "goal",
    priority: 1,
    name: "테스트 목표",
    description: null,
    target_age: null,
    target_date: null,
    required_amount: "1000000",
    monthly_saving_amount: "100000",
    current_amount: "0",
    progress_pct: "0",
    sort_order: 0,
    funding_sources: [],
    months_remaining: 10,
    suggested_monthly_amount: "100000",
    weighted_return_rate_pct: null,
    projected_months_with_growth: null,
    start_date: null,
    status: "active",
    effective_status: null,
    created_by_id: null,
    completed_at: null,
    ...overrides,
  };
}

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("sortGoals", () => {
  it("sorts by priority ascending for 우선순위순", () => {
    const goals = [makeGoal({ id: 1, priority: 3 }), makeGoal({ id: 2, priority: 1 }), makeGoal({ id: 3, priority: 2 })];
    expect(sortGoals(goals, "우선순위순").map((g) => g.id)).toEqual([2, 3, 1]);
  });

  it("sorts by progress_pct ascending for 진행률순", () => {
    const goals = [
      makeGoal({ id: 1, progress_pct: "80" }),
      makeGoal({ id: 2, progress_pct: "10" }),
      makeGoal({ id: 3, progress_pct: "50" }),
    ];
    expect(sortGoals(goals, "진행률순").map((g) => g.id)).toEqual([2, 3, 1]);
  });

  it("sorts by nearest target_date first for 마감임박순", () => {
    const goals = [
      makeGoal({ id: 1, target_date: isoDaysFromNow(90) }),
      makeGoal({ id: 2, target_date: isoDaysFromNow(10) }),
      makeGoal({ id: 3, target_date: isoDaysFromNow(30) }),
    ];
    expect(sortGoals(goals, "마감임박순").map((g) => g.id)).toEqual([2, 3, 1]);
  });

  it("puts target_age-only goals after dated goals, and goals with neither at the end", () => {
    const goals = [
      makeGoal({ id: 1, target_date: null, target_age: null }),
      makeGoal({ id: 2, target_date: isoDaysFromNow(30) }),
      makeGoal({ id: 3, target_date: null, target_age: 40 }),
    ];
    expect(sortGoals(goals, "마감임박순").map((g) => g.id)).toEqual([2, 3, 1]);
  });

  it("does not mutate the input array", () => {
    const goals = [makeGoal({ id: 1, priority: 2 }), makeGoal({ id: 2, priority: 1 })];
    const original = goals.slice();
    sortGoals(goals, "우선순위순");
    expect(goals).toEqual(original);
  });
});
