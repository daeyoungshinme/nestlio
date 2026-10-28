import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TransactionForm from "@/components/transactions/TransactionForm";
import type { AccountWithBalanceOut, CategoryOut } from "@/types";

vi.mock("@/api/transactions", () => ({ fetchRecentTransactions: vi.fn().mockResolvedValue([]) }));
vi.mock("@/api/cashflowPlan", () => ({ fetchCashflowPlan: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock("@/api/cards", () => ({
  fetchCards: vi.fn().mockResolvedValue([
    {
      card: { id: 7, name: "신한카드", card_type: "debit", payment_account_id: 3, is_active: true },
      unlinked_transaction_count: 0,
    },
  ]),
}));

const categories = [
  { id: 1, name: "식비", kind: "expense", type: "variable", color: "#000", is_active: true, sort_order: 0 },
  { id: 2, name: "교통", kind: "expense", type: "variable", color: "#000", is_active: true, sort_order: 1 },
  { id: 3, name: "급여", kind: "income", type: "fixed", color: "#000", is_active: true, sort_order: 2 },
] as CategoryOut[];

const accounts = [
  { account: { id: 3, name: "월급통장" }, balance: "0" },
  { account: { id: 4, name: "비상금통장" }, balance: "0" },
] as AccountWithBalanceOut[];

function renderForm(onSubmit = vi.fn(), formAccounts: AccountWithBalanceOut[] = []) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TransactionForm
        categories={categories}
        accounts={formAccounts}
        savingsProducts={[]}
        users={[]}
        submitLabel="추가"
        onSubmit={onSubmit}
        layout="stack"
        isNew
      />
    </QueryClientProvider>,
  );
  return onSubmit;
}

// 신규 입력에 카테고리를 미리 골라 두면 바꾸지 않고 저장해 오분류된다 — 고르기 전엔 제출되지 않아야 한다.
describe("TransactionForm category", () => {
  it("starts without a category and blocks submit until one is chosen", () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText(/금액/), { target: { value: "12000" } });
    expect(screen.getByRole("button", { name: "식비" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("카테고리를 골라주세요");

    fireEvent.click(screen.getByRole("button", { name: "교통" }));
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category_id: 2, amount: "12000" }));
  });
});

// 카드를 고르면 계좌가 카드의 결제계좌로 잠기고, 카드가 아닌 결제수단으로 바꾸면 다시 고를 수 있다.
describe("TransactionForm card", () => {
  it("links the account to the chosen card's payment account", async () => {
    const onSubmit = renderForm(vi.fn(), accounts);
    fireEvent.change(screen.getByLabelText(/금액/), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "식비" }));
    fireEvent.click(screen.getByRole("button", { name: /상세 입력/ }));

    const payment = screen.getByLabelText("결제");
    await screen.findByRole("option", { name: "신한카드 (체크카드)" });
    fireEvent.change(payment, { target: { value: "card:7" } });

    const account = screen.getByLabelText("계좌");
    expect(account).toBeDisabled();
    expect(account).toHaveValue("3");

    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ card_id: 7, account_id: 3 }));

    fireEvent.change(payment, { target: { value: "method:cash" } });
    expect(account).toBeEnabled();
    fireEvent.change(account, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ card_id: null, account_id: 4, payment_method: "cash" }),
    );
  });
});

// 결제 선택칸은 지출에만 보인다 — 지출에서 고른 값이 수입으로 바꾼 뒤 숨은 채 저장되면 안 된다.
describe("TransactionForm type toggle", () => {
  it("clears the hidden payment method when switching to income", () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByRole("button", { name: /상세 입력/ }));
    fireEvent.change(screen.getByLabelText("결제"), { target: { value: "method:cash" } });

    fireEvent.click(screen.getByRole("button", { name: "수입" }));
    expect(screen.queryByLabelText("결제")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/금액/), { target: { value: "3000000" } });
    fireEvent.click(screen.getByRole("button", { name: "급여" }));
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ type: "income", payment_method: null }));
  });
});
