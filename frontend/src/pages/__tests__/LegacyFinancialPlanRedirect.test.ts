import { describe, expect, it } from "vitest";
import { legacyFinancialPlanTarget } from "@/pages/LegacyFinancialPlanRedirect";

describe("legacyFinancialPlanTarget", () => {
  it.each([
    ["", "/goals"],
    ["view=목표", "/goals"],
    ["tab=목표", "/goals"],
    ["view=이번 달", "/plan?view=이번 달"],
    ["view=이번 달 계획", "/plan?view=이번 달"],
    ["tab=현금흐름 계획", "/plan?view=이번 달"],
    ["view=연간", "/plan?view=연간"],
    ["view=연간계획", "/plan?view=연간"],
  ])("%s → %s", (query, expected) => {
    expect(legacyFinancialPlanTarget(new URLSearchParams(query))).toBe(expected);
  });
});
