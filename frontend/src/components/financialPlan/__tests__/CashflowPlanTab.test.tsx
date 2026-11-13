import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CashflowPlanItemOut, CashflowPlanListOut } from "@/types";

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

const section = (planned: string, actual: string | null = null) => ({
  planned,
  actual,
  pct: null,
  status: null,
  suggested_amount: null,
});

function item(overrides: Partial<CashflowPlanItemOut>): CashflowPlanItemOut {
  return {
    id: 1,
    section: "fixed",
    year_month: "2026-11",
    owner_user_id: null,
    name: "월세",
    amount: "800000",
    category_id: null,
    category_name: null,
    category_color: null,
    sort_order: 0,
    installment_no: null,
    installment_total: null,
    installment_total_amount: null,
    recurring_expense_id: null,
    recurring_active: null,
    spans_multiple_months: false,
    ...overrides,
  };
}

const PLAN: CashflowPlanListOut = {
  year_month: "2026-11",
  prev_month: "2026-10",
  next_month: "2026-12",
  items: [item({}), item({ id: 2, section: "income", name: "월급", amount: "4000000" })],
  summary: {
    income: section("4000000", "4000000"),
    fixed: section("800000"),
    variable: section("0"),
    irregular: section("0"),
    expense_total: "800000",
    available: "3200000",
  },
  category_budgets: [],
};

const ok = <T,>(data: T) => ({ data, error: null, isError: false, isLoading: false, refetch: vi.fn() });

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <CashflowPlanTab view="monthly" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useCashflowPlan.mockReturnValue(ok(PLAN));
  useSavingsProductsPlan.mockReturnValue(
    ok({ savings: { planned: "500000", actual: null }, investment: { planned: "0", actual: null }, items: [] }),
  );
});

// 분할(PR L: render-prop 본문을 별도 컴포넌트로) 전 안전망 — 섹션 요약과 펼친 항목 목록을 고정한다.
describe("CashflowPlanTab — 이번 달 계획", () => {
  it("summarises every section including savings·investment", () => {
    renderTab();
    for (const label of ["수입", "고정지출", "변동지출", "비정기지출", "저축·투자"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: /수입/ })).toHaveTextContent("400만원 / 400만원");
    expect(screen.getByRole("button", { name: /고정지출/ })).toHaveTextContent("계획 80만원");
    expect(screen.getByRole("button", { name: /저축·투자/ })).toHaveTextContent("계획 50만원");
  });

  it("lists only that section's items when a section is opened", () => {
    renderTab();
    expect(screen.queryByText("월세")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /고정지출/ }));

    expect(screen.getByText("월세")).toBeInTheDocument();
    expect(screen.queryByText("월급")).not.toBeInTheDocument();
  });
});
