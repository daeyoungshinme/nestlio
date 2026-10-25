import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DailyTransactionGroups from "@/components/transactions/DailyTransactionGroups";
import TransactionListItem from "@/components/transactions/TransactionListItem";
import type { TransactionOut } from "@/types";

let nextId = 1;
function tx(date: string, overrides: Partial<TransactionOut> = {}): TransactionOut {
  return {
    id: nextId++,
    amount: "12000.00",
    type: "expense",
    transaction_date: date,
    description: "점심",
    payment_method: "credit_card",
    category: { id: 1, name: "식비", kind: "expense", type: "variable" },
    account: null,
    savings_product: null,
    savings_product_id: null,
    owner_user_id: null,
    ...overrides,
  } as TransactionOut;
}

describe("TransactionListItem", () => {
  // 연필/휴지통 대신 행 전체가 수정 버튼이다 — 삭제는 수정 폼 안에 있다.
  it("opens edit when the whole row is tapped and has no separate delete button", () => {
    const onEdit = vi.fn();
    const item = tx("2026-10-01");
    render(<TransactionListItem tx={item} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: /점심/ }));
    expect(onEdit).toHaveBeenCalledWith(item);
    expect(screen.queryByRole("button", { name: /삭제/ })).toBeNull();
  });

  it("drops the income/expense badge and keeps the category in the meta line", () => {
    render(<TransactionListItem tx={tx("2026-10-01")} onEdit={() => {}} />);
    expect(screen.queryByText("지출")).toBeNull();
    expect(screen.getByText("식비 · 신용카드")).toBeInTheDocument();
    expect(screen.getByText("-12,000원")).toBeInTheDocument();
  });
});

describe("DailyTransactionGroups default open", () => {
  const openDays = () => screen.getAllByRole("button", { expanded: true }).length;

  it("expands every day when the month is short", () => {
    const list = ["2026-09-30", "2026-09-20", "2026-09-10", "2026-09-01"].map((d) => tx(d));
    render(<DailyTransactionGroups transactions={list} onEdit={() => {}} showUser={false} />);
    expect(openDays()).toBe(4);
  });

  it("expands only the most recent 3 days of a long past month", () => {
    const list = Array.from({ length: 25 }, (_, i) => tx(`2026-09-${String(28 - i).padStart(2, "0")}`));
    render(<DailyTransactionGroups transactions={list} onEdit={() => {}} showUser={false} />);
    expect(openDays()).toBe(3);
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(22);
  });
});
