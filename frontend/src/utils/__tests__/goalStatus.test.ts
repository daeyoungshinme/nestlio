import { describe, expect, it } from "vitest";
import { computeGoalStatus, daysUntil } from "@/utils/goalStatus";
import type { FinancialGoalOut } from "@/types";

function makeGoal(overrides: Partial<FinancialGoalOut>): FinancialGoalOut {
  return {
    id: 1,
    priority: 1,
    name: "테스트 목표",
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
