import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LedgerDayModal from "@/components/transactions/LedgerDayModal";

function renderModal(overrides: Partial<Parameters<typeof LedgerDayModal>[0]> = {}) {
  const props = {
    date: "2026-09-26",
    transactions: [],
    events: [],
    recurringDue: [],
    onBack: vi.fn(),
    onClose: vi.fn(),
    onAddTransaction: vi.fn(),
    onEditTransaction: vi.fn(),
    onDeleteTransaction: vi.fn(),
    onAddEvent: vi.fn(),
    onEditEvent: vi.fn(),
    onDeleteEvent: vi.fn(),
    onToggleEventComplete: vi.fn(),
    ...overrides,
  };
  render(<LedgerDayModal {...props} />);
  return props;
}

describe("LedgerDayModal", () => {
  it("shows the day list and asks the page to open the add form in the sheet", () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "내역 추가" }));

    expect(props.onAddTransaction).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("renders the panel instead of the list and returns to the list via the back button", () => {
    const props = renderModal({ panel: { title: "내역 추가", content: <p>폼 자리</p> } });

    expect(screen.getByRole("heading", { name: "내역 추가" })).toBeInTheDocument();
    expect(screen.getByText("폼 자리")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내역 추가" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /목록으로/ }));
    expect(props.onBack).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
