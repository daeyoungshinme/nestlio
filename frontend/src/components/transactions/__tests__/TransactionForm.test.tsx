import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TransactionForm from "@/components/transactions/TransactionForm";
import type { CategoryOut } from "@/types";

vi.mock("@/api/transactions", () => ({ fetchRecentTransactions: vi.fn().mockResolvedValue([]) }));
vi.mock("@/api/cashflowPlan", () => ({ fetchCashflowPlan: vi.fn().mockResolvedValue({ items: [] }) }));

const categories = [
  { id: 1, name: "식비", kind: "expense", type: "variable", color: "#000", is_active: true, sort_order: 0 },
  { id: 2, name: "교통", kind: "expense", type: "variable", color: "#000", is_active: true, sort_order: 1 },
] as CategoryOut[];

function renderForm(onSubmit = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TransactionForm
        categories={categories}
        accounts={[]}
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
