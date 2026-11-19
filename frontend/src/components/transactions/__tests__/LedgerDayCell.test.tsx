import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LedgerDayCell from "@/components/transactions/LedgerDayCell";
import type { TransactionOut } from "@/types";

const tx = (id: number, type: "income" | "expense", amount: string, isSavings = false) =>
  ({
    id,
    type,
    amount,
    description: `항목${id}`,
    transaction_date: "2026-11-19",
    category: { id: isSavings ? 9 : 1, name: isSavings ? "저축" : "식비", is_savings: isSavings },
  }) as unknown as TransactionOut;

function renderCell(transactions: TransactionOut[]) {
  render(
    <LedgerDayCell
      date="2026-11-19"
      day={19}
      inCurrentMonth
      isToday={false}
      isSelected={false}
      view="내역"
      transactions={transactions}
      events={[]}
      recurringDue={[]}
      onSelect={vi.fn()}
    />,
  );
  return screen.getByRole("button");
}

describe("LedgerDayCell", () => {
  it("shows the mobile net without counting savings", () => {
    renderCell([tx(1, "income", "50000"), tx(2, "expense", "12000"), tx(3, "expense", "300000", true)]);
    expect(screen.getByText("+4만")).toBeInTheDocument();
  });

  it("shows a count instead of an amount when the net is 0 or the day is savings-only", () => {
    renderCell([tx(1, "expense", "300000", true)]);
    expect(screen.getByText("거래 1")).toBeInTheDocument();
  });

  // aria-label로 날짜만 덮으면 칸의 금액·미리보기가 스크린리더에 안 읽힌다.
  it("is named by the date followed by the cell content", () => {
    const cell = renderCell([tx(1, "expense", "12000")]);
    expect(cell.getAttribute("aria-label")).toBeNull();
    expect(cell).toHaveAccessibleName(expect.stringMatching(/^11\.19 \(목\).*항목1/));
  });
});
