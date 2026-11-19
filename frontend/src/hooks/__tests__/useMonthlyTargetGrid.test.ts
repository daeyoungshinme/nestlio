import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMonthlyTargetGrid } from "@/hooks/useMonthlyTargetGrid";

describe("useMonthlyTargetGrid", () => {
  it("builds the amount map and total from existing targets", () => {
    const targets = [
      { year_month: "2026-09", target_amount: "100000" },
      { year_month: "2026-10", target_amount: "50000" },
    ];
    const { result } = renderHook(() => useMonthlyTargetGrid("2026-09", "2026-11", targets, vi.fn()));

    expect(result.current.months).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(result.current.amountByMonth.get("2026-09")).toBe("100000");
    expect(result.current.amountByMonth.get("2026-10")).toBe("50000");
    expect(result.current.amountByMonth.has("2026-11")).toBe(false);
    expect(result.current.total).toBe(150000);
  });

  it("setAmount updates only the target month and preserves the rest", () => {
    const targets = [
      { year_month: "2026-09", target_amount: "100000" },
      { year_month: "2026-10", target_amount: "50000" },
    ];
    const onChange = vi.fn();
    const { result } = renderHook(() => useMonthlyTargetGrid("2026-09", "2026-10", targets, onChange));

    result.current.setAmount("2026-10", "70000");

    expect(onChange).toHaveBeenCalledWith([
      { year_month: "2026-09", target_amount: "100000" },
      { year_month: "2026-10", target_amount: "70000" },
    ]);
  });

  it("handleDistributeEvenly splits the given amount across all months", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useMonthlyTargetGrid("2026-09", "2026-11", [], onChange));

    result.current.handleDistributeEvenly("300000");

    expect(onChange).toHaveBeenCalledWith([
      { year_month: "2026-09", target_amount: "100000" },
      { year_month: "2026-10", target_amount: "100000" },
      { year_month: "2026-11", target_amount: "100000" },
    ]);
  });

  // 총액이 비었거나 0이면 이미 입력한 달 값을 0으로 지우지 않는다.
  it("handleDistributeEvenly does nothing for an empty or zero amount", () => {
    const onChange = vi.fn();
    const targets = [{ year_month: "2026-09", target_amount: "100000" }];
    const { result } = renderHook(() => useMonthlyTargetGrid("2026-09", "2026-10", targets, onChange));

    result.current.handleDistributeEvenly("");
    result.current.handleDistributeEvenly("0");

    expect(onChange).not.toHaveBeenCalled();
  });
});
