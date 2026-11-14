import { describe, expect, it } from "vitest";
import { savingsInvestmentActual, savingsInvestmentPlanned } from "@/utils/planTotals";

const group = (planned: string, actual: string | null) => ({ planned, actual });

describe("savingsInvestmentActual", () => {
  it("sums both groups", () => {
    expect(savingsInvestmentActual({ savings: group("100", "30"), investment: group("50", "20") })).toBe(50);
  });

  it("is null when either group has no actual or the plan is missing", () => {
    expect(savingsInvestmentActual({ savings: group("100", null), investment: group("50", "20") })).toBeNull();
    expect(savingsInvestmentActual(undefined)).toBeNull();
  });
});

describe("savingsInvestmentPlanned", () => {
  it("sums planned and is 0 without a plan", () => {
    expect(savingsInvestmentPlanned({ savings: group("100", null), investment: group("50", null) })).toBe(150);
    expect(savingsInvestmentPlanned(undefined)).toBe(0);
  });
});
