import { describe, expect, it } from "vitest";
import { installmentProgressLabel, monthsRemainingInYear } from "@/utils/installment";

describe("monthsRemainingInYear", () => {
  it("counts the current month through December, inclusive", () => {
    expect(monthsRemainingInYear("2026-08")).toBe(5);
  });

  it("returns 12 for a January start", () => {
    expect(monthsRemainingInYear("2026-01")).toBe(12);
  });

  it("returns 1 for a December start", () => {
    expect(monthsRemainingInYear("2026-12")).toBe(1);
  });
});

describe("installmentProgressLabel", () => {
  it("returns null for non-installment items", () => {
    expect(
      installmentProgressLabel({ installment_no: null, installment_total: null, installment_total_amount: null }),
    ).toBeNull();
  });

  it("computes progress text from installment_no / installment_total", () => {
    expect(
      installmentProgressLabel({
        installment_no: 3,
        installment_total: 12,
        installment_total_amount: "1200000.00",
      }),
    ).toBe("총 1,200,000원 중 300,000원 진행 (25%)");
  });

  it("shows 100% progress on the last installment", () => {
    expect(
      installmentProgressLabel({
        installment_no: 12,
        installment_total: 12,
        installment_total_amount: "1200000.00",
      }),
    ).toBe("총 1,200,000원 중 1,200,000원 진행 (100%)");
  });
});
