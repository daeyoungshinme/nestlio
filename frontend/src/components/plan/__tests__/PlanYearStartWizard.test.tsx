import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_RELATED_KEYS } from "@/constants/queryKeys";

const seedAnnualPlan = vi.fn();
vi.mock("@/api/annualPlan", () => ({ seedAnnualPlan: (...args: unknown[]) => seedAnnualPlan(...args) }));
const toast = vi.fn();
vi.mock("@/utils/toast", () => ({ toast: (...args: unknown[]) => toast(...args) }));

const { default: PlanYearStartWizard } = await import("@/components/plan/PlanYearStartWizard");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlanYearStartWizard", () => {
  it("seeds the year from the chosen source and refreshes every plan query", async () => {
    seedAnnualPlan.mockResolvedValue({ items: [] });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(
      <QueryClientProvider client={client}>
        <PlanYearStartWizard year={2027} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /반복 거래로 채우기/ }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining("2027년 계획 초안"), "success"));
    expect(seedAnnualPlan.mock.calls[0][0]).toEqual({ year: 2027, source: "recurring" });
    // 이번 달 뷰·연간·대시보드가 같은 원본이라 함께 갱신돼야 한다.
    for (const queryKey of PLAN_RELATED_KEYS) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  });

  it("locks every option while a seed request is in flight", async () => {
    seedAnnualPlan.mockReturnValue(new Promise(() => {}));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PlanYearStartWizard year={2027} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /작년 계획 이어가기/ }));

    await waitFor(() => {
      for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    });
  });
});
