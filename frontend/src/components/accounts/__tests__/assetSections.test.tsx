import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountWithBalanceOut, FinancialGoalOut, LoanOut, SavingsProductOut } from "@/types";

// 분할 전 안전망 — 계좌·저축/투자·부동산·대출 섹션의 목록·동기화·추가·비활성화 동작을 고정한다(F: 자산 섹션 공용화).
const api = vi.hoisted(() => ({
  fetchAccounts: vi.fn(),
  syncAccount: vi.fn(),
  fetchSavingsProducts: vi.fn(),
  syncSavingsProduct: vi.fn(),
  fetchSavingsProductsPlan: vi.fn(),
  syncRealEstate: vi.fn(),
  fetchGoals: vi.fn(),
  fetchLoans: vi.fn(),
  createLoan: vi.fn(),
  updateLoan: vi.fn(),
  deactivateLoan: vi.fn(),
}));

vi.mock("@/api/accounts", async (orig) => ({
  ...(await orig<typeof import("@/api/accounts")>()),
  fetchAccounts: () => api.fetchAccounts(),
  syncAccount: (id: number) => api.syncAccount(id),
}));
vi.mock("@/api/savingsProducts", async (orig) => ({
  ...(await orig<typeof import("@/api/savingsProducts")>()),
  fetchSavingsProducts: () => api.fetchSavingsProducts(),
  syncSavingsProduct: (id: number) => api.syncSavingsProduct(id),
  fetchSavingsProductsPlan: (ym: string) => api.fetchSavingsProductsPlan(ym),
}));
vi.mock("@/api/realEstate", async (orig) => ({
  ...(await orig<typeof import("@/api/realEstate")>()),
  syncRealEstate: (id: number) => api.syncRealEstate(id),
}));
vi.mock("@/api/goals", async (orig) => ({
  ...(await orig<typeof import("@/api/goals")>()),
  fetchGoals: () => api.fetchGoals(),
}));
vi.mock("@/api/loans", () => ({
  fetchLoans: () => api.fetchLoans(),
  createLoan: (payload: unknown) => api.createLoan(payload),
  updateLoan: (id: number, payload: unknown) => api.updateLoan(id, payload),
  deactivateLoan: (id: number) => api.deactivateLoan(id),
}));

const { default: AccountsSection } = await import("@/components/accounts/AccountsSection");
const { default: SavingsProductsSection } = await import("@/components/accounts/SavingsProductsSection");
const { default: RealEstateSection } = await import("@/components/accounts/RealEstateSection");
const { default: LoansSection } = await import("@/components/accounts/LoansSection");

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function product(overrides: Partial<SavingsProductOut> = {}): SavingsProductOut {
  return {
    id: 11,
    name: "청약통장",
    current_balance: "3000000",
    monthly_saving_amount: "100000",
    product_type: "savings",
    principal_amount: null,
    return_amount: null,
    return_rate_pct: null,
    sort_order: 0,
    is_active: true,
    growlio_account_id: null,
    auto_sync_enabled: false,
    last_synced_at: null,
    owner_user_id: null,
    linked_goal_id: null,
    linked_goal_name: null,
    ...overrides,
  };
}

function loan(overrides: Partial<LoanOut> = {}): LoanOut {
  return {
    id: 21,
    name: "전세대출",
    balance: "50000000",
    monthly_payment: "300000",
    origination_year_month: null,
    term_months: null,
    interest_rate: null,
    repayment_method: "equal_payment",
    owner_user_id: null,
    growlio_account_id: null,
    last_synced_at: null,
    ...overrides,
  } as LoanOut;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchGoals.mockResolvedValue([]);
  api.fetchSavingsProductsPlan.mockResolvedValue({ items: [] });
  for (const fn of [api.syncAccount, api.syncSavingsProduct, api.syncRealEstate, api.createLoan, api.updateLoan, api.deactivateLoan]) {
    fn.mockResolvedValue({});
  }
});

describe("AccountsSection", () => {
  it("shows the last sync time for a growlio-linked account and syncs it", async () => {
    api.fetchAccounts.mockResolvedValue([
      {
        account: {
          id: 5,
          name: "급여통장",
          account_type: "checking",
          owner_user_id: null,
          growlio_account_id: "g-5",
          last_synced_at: null,
          is_active: true,
        },
        balance: "1200000",
      } as unknown as AccountWithBalanceOut,
    ]);
    renderWithClient(<AccountsSection users={[]} />);

    expect(await screen.findByText("급여통장")).toBeInTheDocument();
    expect(screen.getByText("아직 동기화하지 않았어요")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "growlio 동기화" })[0]);
    await waitFor(() => expect(api.syncAccount).toHaveBeenCalledWith(5));
  });
});

describe("SavingsProductsSection", () => {
  it("shows the linked goal badge, this month's plan and syncs a linked product", async () => {
    api.fetchSavingsProducts.mockResolvedValue([product({ growlio_account_id: "g-11" })]);
    api.fetchGoals.mockResolvedValue([
      { id: 1, name: "내집마련", funding_sources: [{ type: "savings_product", id: 11 }] } as unknown as FinancialGoalOut,
    ]);
    api.fetchSavingsProductsPlan.mockResolvedValue({ items: [{ id: 11, planned: "250000" }] });
    renderWithClient(<SavingsProductsSection users={[]} />);

    expect(await screen.findByText("목표: 내집마련")).toBeInTheDocument();
    expect(await screen.findByText(/월 250,000원/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "growlio 동기화" })[0]);
    await waitFor(() => expect(api.syncSavingsProduct).toHaveBeenCalledWith(11));
  });
});

describe("RealEstateSection", () => {
  it("lists only real estate with purchase price and syncs price/mortgage", async () => {
    api.fetchSavingsProducts.mockResolvedValue([
      product(),
      product({
        id: 12,
        name: "아파트",
        product_type: "real_estate",
        current_balance: "500000000",
        principal_amount: "400000000",
        return_amount: "100000000",
        return_rate_pct: "25",
        growlio_account_id: "g-12",
        last_synced_at: "2026-11-01T09:00:00",
      }),
    ]);
    renderWithClient(<RealEstateSection users={[]} />);

    expect(await screen.findByText("아파트")).toBeInTheDocument();
    expect(screen.queryByText("청약통장")).not.toBeInTheDocument();
    expect(screen.getByText(/매입가 400,000,000원/)).toBeInTheDocument();
    expect(screen.getByText(/^마지막 동기화/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "growlio 시세/담보대출 동기화" })[0]);
    await waitFor(() => expect(api.syncRealEstate).toHaveBeenCalledWith(12));
  });
});

describe("LoansSection", () => {
  it("shows the empty state without a growlio import button", async () => {
    api.fetchLoans.mockResolvedValue([]);
    renderWithClient(<LoansSection users={[]} />);

    expect(await screen.findByText("등록된 대출이 없어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /growlio에서 가져오기/ })).not.toBeInTheDocument();
  });

  it("lists loans with the monthly payment total", async () => {
    api.fetchLoans.mockResolvedValue([loan(), loan({ id: 22, name: "신용대출", monthly_payment: "200000" })]);
    renderWithClient(<LoansSection users={[]} />);

    expect(await screen.findByText("전세대출")).toBeInTheDocument();
    expect(screen.getByText("500,000원")).toBeInTheDocument();
    expect(screen.getAllByText(/원리금균등/).length).toBeGreaterThan(0);
  });

  it("creates a loan from the form", async () => {
    api.fetchLoans.mockResolvedValue([]);
    renderWithClient(<LoansSection users={[]} />);
    await screen.findByText("등록된 대출이 없어요");

    fireEvent.click(screen.getByRole("button", { name: "대출 추가" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^상품명/), { target: { value: "학자금" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "추가" }));

    await waitFor(() => expect(api.createLoan).toHaveBeenCalled());
    expect(api.createLoan.mock.calls[0][0]).toMatchObject({ name: "학자금", repayment_method: null, owner_user_id: null });
  });

  it("edits and deactivates a loan", async () => {
    api.fetchLoans.mockResolvedValue([loan()]);
    renderWithClient(<LoansSection users={[]} />);
    await screen.findByText("전세대출");

    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^상품명/), { target: { value: "전세대출(갱신)" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(api.updateLoan).toHaveBeenCalled());
    expect(api.updateLoan.mock.calls[0][0]).toBe(21);
    expect(api.updateLoan.mock.calls[0][1]).toMatchObject({ name: "전세대출(갱신)" });

    fireEvent.click(screen.getAllByRole("button", { name: "비활성화" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "확인" }));
    await waitFor(() => expect(api.deactivateLoan).toHaveBeenCalledWith(21));
  });
});
