import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GoalMonthlyTargetEditor from "@/components/financialPlan/GoalMonthlyTargetEditor";

describe("GoalMonthlyTargetEditor", () => {
  // 3년짜리 목표는 예전엔 36행이었다 — 격자로 두고 해마다 접어 첫 해만 펼친다.
  it("folds a multi-year range by year with only the first year open", () => {
    render(
      <GoalMonthlyTargetEditor
        startMonth="2026-11"
        endMonth="2028-02"
        targets={[{ year_month: "2027-01", target_amount: "500000" }]}
        onChange={() => {}}
      />,
    );
    const yearToggles = ["2026년", "2027년", "2028년"].map((y) => screen.getByRole("button", { name: new RegExp(y) }));
    expect(yearToggles.map((b) => b.getAttribute("aria-expanded"))).toEqual(["true", "false", "false"]);
    expect(screen.getAllByRole("textbox", { name: /월$/ })).toHaveLength(2);

    fireEvent.click(yearToggles[1]);
    expect(screen.getAllByRole("textbox", { name: /월$/ })).toHaveLength(14);
    expect(screen.getByRole("button", { name: /2027년/ })).toHaveTextContent("50만원");
  });

  it("uses the same 'all months' preset as the annual plan grid", () => {
    const onChange = vi.fn();
    render(<GoalMonthlyTargetEditor startMonth="2026-11" endMonth="2026-12" targets={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("매달 같은 금액"), { target: { value: "300000" } });
    fireEvent.click(screen.getByRole("button", { name: "모든 달에 적용" }));
    expect(onChange).toHaveBeenLastCalledWith([
      { year_month: "2026-11", target_amount: "300000" },
      { year_month: "2026-12", target_amount: "300000" },
    ]);
  });
});
