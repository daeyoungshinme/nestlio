import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountWithBalanceOut, CardWithUsageOut } from "@/types";

const fetchCards = vi.fn();
const createCard = vi.fn();
const updateCard = vi.fn();
const deactivateCard = vi.fn();
vi.mock("@/api/cards", () => ({
  fetchCards: () => fetchCards(),
  createCard: (...args: unknown[]) => createCard(...args),
  updateCard: (...args: unknown[]) => updateCard(...args),
  deactivateCard: (...args: unknown[]) => deactivateCard(...args),
}));
const fetchAccounts = vi.fn();
vi.mock("@/api/accounts", () => ({ fetchAccounts: () => fetchAccounts() }));

const { default: CardsSection } = await import("@/components/accounts/CardsSection");

const ACCOUNT = { account: { id: 3, name: "급여통장", is_active: true } } as unknown as AccountWithBalanceOut;

function cardRow(overrides: Partial<CardWithUsageOut["card"]> = {}, unlinked = 0): CardWithUsageOut {
  return {
    card: {
      id: 7,
      name: "신한 체크",
      card_type: "debit",
      owner_user_id: null,
      payment_account: { id: 3, name: "급여통장", is_active: true },
      ...overrides,
    },
    unlinked_transaction_count: unlinked,
  } as unknown as CardWithUsageOut;
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CardsSection users={[]} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchAccounts.mockResolvedValue([ACCOUNT]);
  createCard.mockResolvedValue({});
  updateCard.mockResolvedValue({});
  deactivateCard.mockResolvedValue({});
});

// 분할 전 안전망 — 결제카드 목록·추가·수정·비활성화의 현재 동작을 고정한다.
describe("CardsSection", () => {
  it("shows the empty state when there are no cards", async () => {
    fetchCards.mockResolvedValue([]);
    renderSection();
    expect(await screen.findByText("등록된 카드가 없어요")).toBeInTheDocument();
  });

  it("shows the payment account, or a warning with the unlinked count when none is set", async () => {
    fetchCards.mockResolvedValue([
      cardRow(),
      cardRow({ id: 8, name: "현대 신용", card_type: "credit", payment_account: null }, 4),
    ]);
    renderSection();
    expect(await screen.findByText("결제계좌 급여통장")).toBeInTheDocument();
    expect(screen.getByText("결제계좌 미지정 · 계좌 없는 거래 4건")).toBeInTheDocument();
  });

  it("creates a card with the chosen payment account", async () => {
    fetchCards.mockResolvedValue([]);
    renderSection();
    await screen.findByText("등록된 카드가 없어요");

    fireEvent.click(screen.getByRole("button", { name: "카드 추가" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^이름/), { target: { value: "국민 신용" } });
    fireEvent.change(within(dialog).getByLabelText("결제계좌"), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "추가" }));

    await waitFor(() =>
      expect(createCard.mock.calls[0][0]).toEqual({
        name: "국민 신용",
        card_type: "credit",
        payment_account_id: 3,
        owner_user_id: null,
      }),
    );
  });

  it("offers to backfill past unlinked transactions when editing", async () => {
    fetchCards.mockResolvedValue([cardRow({ payment_account: null }, 2)]);
    renderSection();
    await screen.findByText("신한 체크");

    fireEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("결제계좌"), { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /지난 거래 2건에도 적용/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));

    await waitFor(() => expect(updateCard).toHaveBeenCalled());
    expect(updateCard.mock.calls[0][0]).toBe(7);
    expect(updateCard.mock.calls[0][1]).toMatchObject({ payment_account_id: 3, apply_to_unlinked: true });
  });

  it("deactivates a card after confirmation", async () => {
    fetchCards.mockResolvedValue([cardRow()]);
    renderSection();
    await screen.findByText("신한 체크");

    fireEvent.click(screen.getAllByRole("button", { name: "비활성화" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "확인" }));

    await waitFor(() => expect(deactivateCard).toHaveBeenCalled());
    expect(deactivateCard.mock.calls[0][0]).toBe(7);
  });
});
