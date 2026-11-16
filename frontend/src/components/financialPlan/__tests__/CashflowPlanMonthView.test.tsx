import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CashflowPlanItemOut, CashflowPlanListOut } from "@/types";

// 분할 전 안전망(G) — 이번 달 계획 본문의 항목 수정·이번 달만 삭제·전월 복사·다음 달 제안 반영을 고정한다.
const api = vi.hoisted(() => ({
  copyPreviousMonthCashflowPlan: vi.fn(),
  deleteCashflowPlanItem: vi.fn(),
  fetchCashflowPlan: vi.fn(),
  splitCashflowPlanItem: vi.fn(),
  upsertCashflowPlanItem: vi.fn(),
}));
vi.mock("@/api/cashflowPlan", () => ({
  copyPreviousMonthCashflowPlan: (ym: string) => api.copyPreviousMonthCashflowPlan(ym),
  deleteCashflowPlanItem: (args: unknown) => api.deleteCashflowPlanItem(args),
  fetchCashflowPlan: (ym: string) => api.fetchCashflowPlan(ym),
  splitCashflowPlanItem: (args: unknown) => api.splitCashflowPlanItem(args),
  upsertCashflowPlanItem: (args: unknown) => api.upsertCashflowPlanItem(args),
}));
vi.mock("@/hooks/useReferenceData", () => ({
  useUsers: () => ({ data: [] }),
  useCategories: () => ({ data: [] }),
}));
// 저축·투자 패널은 자기 쿼리를 따로 돈다 — 이 테스트의 관심사가 아니다.
vi.mock("@/components/financialPlan/SavingsInvestmentPlanPanel", () => ({ default: () => null }));

const { default: CashflowPlanMonthView } = await import("@/components/financialPlan/CashflowPlanMonthView");

const section = (planned: string, extra: Partial<{ actual: string | null; status: "ok" | "warn" | "critical" | null; suggested_amount: string | null }> = {}) => ({
  planned,
  actual: null,
  pct: null,
  status: null,
  suggested_amount: null,
  ...extra,
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

function plan(items: CashflowPlanItemOut[], incomeExtra = {}): CashflowPlanListOut {
  return {
    year_month: "2026-11",
    prev_month: "2026-10",
    next_month: "2026-12",
    items,
    summary: {
      income: section("4000000", incomeExtra),
      fixed: section("800000"),
      variable: section("0"),
      irregular: section("0"),
      expense_total: "800000",
      available: "3200000",
    },
    category_budgets: [],
  };
}

function renderView(data: CashflowPlanListOut) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CashflowPlanMonthView yearMonth="2026-11" setYearMonth={vi.fn()} data={data} savingsPlanData={undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const openSection = (label: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}`) }));

beforeEach(() => {
  vi.clearAllMocks();
  api.upsertCashflowPlanItem.mockResolvedValue({});
  api.deleteCashflowPlanItem.mockResolvedValue({});
  api.copyPreviousMonthCashflowPlan.mockResolvedValue({ copied: 2 });
});

describe("CashflowPlanMonthView", () => {
  it("edits an item's amount for this month only", async () => {
    renderView(plan([item({})]));
    openSection("고정");
    fireEvent.click(screen.getByRole("button", { name: "월세 수정" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^금액/), { target: { value: "850000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));

    await waitFor(() => expect(api.upsertCashflowPlanItem).toHaveBeenCalled());
    expect(api.upsertCashflowPlanItem.mock.calls[0][0]).toMatchObject({
      id: 1,
      section: "fixed",
      year_month: "2026-11",
      name: "월세",
      amount: "850000",
    });
  });

  it("deletes only this month's amount after confirming", async () => {
    renderView(plan([item({})]));
    openSection("고정");
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(screen.getByText(/이번 달 금액을 삭제할까요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => expect(api.deleteCashflowPlanItem).toHaveBeenCalledWith({ id: 1, yearMonth: "2026-11" }));
  });

  it("copies the previous month into an empty month", async () => {
    renderView(plan([]));
    fireEvent.click(screen.getByRole("button", { name: /전월 계획 복사/ }));

    await waitFor(() => expect(api.copyPreviousMonthCashflowPlan).toHaveBeenCalledWith("2026-11"));
  });

  it("applies the income suggestion to next month's matching item", async () => {
    api.fetchCashflowPlan.mockResolvedValue(
      plan([item({ id: 9, section: "income", name: "월급", amount: "4000000", year_month: "2026-12", sort_order: 3 })]),
    );
    renderView(plan([item({ id: 2, section: "income", name: "월급", amount: "4000000" })], { status: "warn", suggested_amount: "4200000" }));
    openSection("수입");
    fireEvent.click(screen.getByRole("button", { name: "다음 달에 반영" }));

    await waitFor(() => expect(api.upsertCashflowPlanItem).toHaveBeenCalled());
    expect(api.fetchCashflowPlan).toHaveBeenCalledWith("2026-12");
    expect(api.upsertCashflowPlanItem.mock.calls[0][0]).toMatchObject({
      id: 9,
      section: "income",
      year_month: "2026-12",
      name: "월급",
      amount: "4200000",
      sort_order: 3,
    });
  });
});
