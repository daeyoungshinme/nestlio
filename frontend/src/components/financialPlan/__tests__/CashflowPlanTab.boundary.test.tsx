import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useCashflowPlan = vi.fn();
const useSavingsProductsPlan = vi.fn();
vi.mock("@/hooks/usePlanQueries", () => ({
  useCashflowPlan: (...args: unknown[]) => useCashflowPlan(...args),
  useSavingsProductsPlan: (...args: unknown[]) => useSavingsProductsPlan(...args),
}));
vi.mock("@/hooks/useReferenceData", () => ({
  useUsers: () => ({ data: [] }),
  useCategories: () => ({ data: [] }),
}));

const { default: CashflowPlanTab } = await import("@/components/financialPlan/CashflowPlanTab");

const pending = { data: undefined, error: null, isError: false, isLoading: true, refetch: vi.fn() };
const failed = { ...pending, isLoading: false, isError: true, error: new Error("boom") };
// 오프라인이면 쿼리가 멈춘다 — isLoading은 false인데 data도 없다.
const paused = { ...pending, isLoading: false };
const loaded = { ...pending, isLoading: false, data: { savings: { planned: "0", actual: null }, investment: { planned: "0", actual: null } } };

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <CashflowPlanTab view="monthly" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CashflowPlanTab — 계획을 아직 못 받은 상태", () => {
  beforeEach(() => {
    useSavingsProductsPlan.mockReturnValue(loaded);
  });

  it("로딩 중이면 본문을 그리지 않고 스켈레톤을 보여준다", () => {
    useCashflowPlan.mockReturnValue(pending);
    const { container } = renderTab();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("조회가 실패하면 크래시 없이 에러 상태를 보여준다", () => {
    useCashflowPlan.mockReturnValue(failed);
    renderTab();
    expect(screen.getByRole("button", { name: /다시/ })).toBeInTheDocument();
  });

  it("오프라인으로 쿼리가 멈춰 있어도 크래시 없이 스켈레톤을 보여준다", () => {
    useCashflowPlan.mockReturnValue(paused);
    const { container } = renderTab();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });
});
