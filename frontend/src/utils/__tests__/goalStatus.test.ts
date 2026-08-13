import { describe, expect, it } from "vitest";
import { computeCardStatus, computeGoalStatus, daysUntil, isGoalAchieved } from "@/utils/goalStatus";
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

describe("daysUntil", () => {
  it("is negative for a past date", () => {
    expect(daysUntil(isoDaysFromNow(-5))).toBeLessThan(0);
  });

  it("is positive for a future date", () => {
    expect(daysUntil(isoDaysFromNow(5))).toBeGreaterThan(0);
  });
});

describe("computeGoalStatus", () => {
  it("returns achieved once progress reaches 100%", () => {
    expect(computeGoalStatus(makeGoal({ progress_pct: "100" }))).toBe("achieved");
    expect(computeGoalStatus(makeGoal({ progress_pct: "120" }))).toBe("achieved");
  });

  it("returns behind when the target date has already passed without completion", () => {
    expect(computeGoalStatus(makeGoal({ progress_pct: "50", target_date: isoDaysFromNow(-1) }))).toBe("behind");
  });

  it("returns neutral when there is no target date/age to judge pace against", () => {
    expect(
      computeGoalStatus(makeGoal({ progress_pct: "10", target_date: null, suggested_monthly_amount: null })),
    ).toBe("neutral");
  });

  it("returns on_track when monthly saving meets the suggested pace", () => {
    expect(
      computeGoalStatus(
        makeGoal({
          progress_pct: "10",
          target_date: isoDaysFromNow(90),
          suggested_monthly_amount: "100000",
          monthly_saving_amount: "100000",
        }),
      ),
    ).toBe("on_track");
  });

  it("returns behind when monthly saving falls meaningfully short of the suggested pace", () => {
    expect(
      computeGoalStatus(
        makeGoal({
          progress_pct: "10",
          target_date: isoDaysFromNow(90),
          suggested_monthly_amount: "100000",
          monthly_saving_amount: "50000",
        }),
      ),
    ).toBe("behind");
  });

  it("tolerates a small rounding shortfall within the 90% slack", () => {
    expect(
      computeGoalStatus(
        makeGoal({
          progress_pct: "10",
          target_date: isoDaysFromNow(90),
          suggested_monthly_amount: "100000",
          monthly_saving_amount: "95000",
        }),
      ),
    ).toBe("on_track");
  });
});

describe("computeCardStatus", () => {
  it("delegates to computeGoalStatus for kind=goal", () => {
    const goal = makeGoal({ kind: "goal", progress_pct: "100" });
    expect(computeCardStatus(goal)).toBe("achieved");
  });

  it("maps a challenge's effective_status instead of using pace-based logic", () => {
    const active = makeGoal({ kind: "challenge", effective_status: "active", suggested_monthly_amount: "999999" });
    const succeeded = makeGoal({ kind: "challenge", effective_status: "succeeded" });
    const expired = makeGoal({ kind: "challenge", effective_status: "expired" });
    expect(computeCardStatus(active)).toBe("on_track");
    expect(computeCardStatus(succeeded)).toBe("achieved");
    expect(computeCardStatus(expired)).toBe("expired");
  });
});

describe("isGoalAchieved", () => {
  it("uses progress_pct for kind=goal", () => {
    expect(isGoalAchieved(makeGoal({ kind: "goal", progress_pct: "100" }))).toBe(true);
    expect(isGoalAchieved(makeGoal({ kind: "goal", progress_pct: "50" }))).toBe(false);
  });

  it("uses effective_status for kind=challenge, keeping expired-but-unmet challenges active", () => {
    expect(isGoalAchieved(makeGoal({ kind: "challenge", effective_status: "succeeded" }))).toBe(true);
    expect(isGoalAchieved(makeGoal({ kind: "challenge", effective_status: "expired" }))).toBe(false);
    expect(isGoalAchieved(makeGoal({ kind: "challenge", effective_status: "active" }))).toBe(false);
  });
});
