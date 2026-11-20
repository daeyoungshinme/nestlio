import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionOut } from "@/types";

const createTransaction = vi.fn();
const deleteTransaction = vi.fn();
vi.mock("@/api/transactions", () => ({
  createTransaction: (...args: unknown[]) => createTransaction(...args),
  deleteTransaction: (...args: unknown[]) => deleteTransaction(...args),
  updateTransaction: vi.fn(),
}));

const toast = vi.fn();
vi.mock("@/utils/toast", () => ({ toast: (...args: unknown[]) => toast(...args) }));

// 폼 자체는 TransactionForm 테스트가 본다 — 여기선 훅이 넘기는 초기값만 확인한다.
const formProps = vi.fn();
vi.mock("@/components/transactions/TransactionForm", () => ({
  default: (props: { initialValues: unknown; onSubmit: (payload: unknown) => void }) => {
    formProps(props.initialValues);
    return (
      <button type="button" onClick={() => props.onSubmit({ amount: "1000" })}>
        제출
      </button>
    );
  },
}));

const { useTransactionActions } = await import("@/hooks/useTransactionActions");

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const args = { categories: [], accounts: [], savingsProducts: [], users: [], currentUserId: "me" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTransactionActions", () => {
  it("추가 후 토스트의 '취소'는 방금 만든 거래를 실제로 지운다", async () => {
    createTransaction.mockResolvedValue({ id: 42 });
    deleteTransaction.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTransactionActions(args), { wrapper });

    act(() => result.current.openCreate("2026-07-15"));
    render(<>{result.current.modals}</>, { wrapper });
    act(() => screen.getByRole("button", { name: "제출" }).click());

    await waitFor(() => expect(toast).toHaveBeenCalledWith("내역을 추가했습니다.", "success", expect.anything()));
    const action = toast.mock.calls[0][2] as { label: string; onClick: () => void };
    expect(action.label).toBe("취소");
    act(() => action.onClick());

    // mutationFn은 (변수, 컨텍스트)로 불린다 — 첫 인자만 본다.
    await waitFor(() => expect(deleteTransaction.mock.calls[0]?.[0]).toBe(42));
  });

  it("수정 폼은 카드·계좌·소유자·저축상품을 채운다", () => {
    const { result } = renderHook(() => useTransactionActions(args), { wrapper });
    const tx = {
      id: 7,
      amount: "12000",
      type: "expense",
      category: { id: 3 },
      transaction_date: "2026-07-10",
      description: null,
      payment_method: "credit_card",
      account: { id: 5 },
      savings_product_id: null,
      owner_user_id: "spouse",
      card_id: 9,
      card: { id: 9 },
    } as unknown as TransactionOut;

    act(() => result.current.openEdit(tx));
    render(<>{result.current.modals}</>, { wrapper });

    expect(formProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category_id: "3",
        account_id: "5",
        card_id: "9",
        owner_user_id: "spouse",
        savings_product_id: "",
        description: "",
      }),
    );
  });
});
