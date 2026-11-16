import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentDateIso, formatDayHeader } from "@/utils/date";
import type { EventOut, TransactionListOut, TransactionOut } from "@/types";

// Tabs의 활성 탭 표시가 ResizeObserver를 쓴다 — jsdom에는 없다.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const fetchTransactions = vi.fn();
vi.mock("@/api/transactions", () => ({
  fetchTransactions: (...args: unknown[]) => fetchTransactions(...args),
  fetchCategoryBreakdown: vi.fn(async () => []),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));
const fetchEvents = vi.fn();
vi.mock("@/api/events", () => ({
  fetchEvents: (...args: unknown[]) => fetchEvents(...args),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  completeEvent: vi.fn(),
}));
const ME = { id: "u-1", display_name: "나" };
vi.mock("@/hooks/useReferenceData", () => {
  const ok = <T,>(data: T) => ({ data, isError: false, isLoading: false, refetch: vi.fn() });
  return {
    useCategories: () => ok([{ id: 1, name: "식비", type: "variable", is_active: true, is_savings: false }]),
    useAccounts: () => ok([]),
    useSavingsProducts: () => ok([]),
    useCards: () => ok([]),
    useMe: () => ok(ME),
    useUsers: () => ok([ME]),
  };
});

const { default: TransactionsPage } = await import("@/pages/TransactionsPage");

const TODAY = currentDateIso();

function tx(overrides: Partial<TransactionOut> = {}): TransactionOut {
  return {
    id: 1,
    type: "expense",
    amount: "12000",
    transaction_date: TODAY,
    description: "점심 김밥",
    payment_method: null,
    account_id: null,
    savings_product_id: null,
    card_id: null,
    category: { id: 1, name: "식비", type: "variable", color: "#f00", is_active: true, is_savings: false },
    account: null,
    card: null,
    savings_product: null,
    user: ME,
    owner_user_id: null,
    created_at: `${TODAY}T12:00:00`,
    updated_at: `${TODAY}T12:00:00`,
    ...overrides,
  } as TransactionOut;
}

function listOut(items: TransactionOut[]): TransactionListOut {
  return {
    items,
    totals: { income: "3000000", expense: "12000", fixed: "0", variable: "12000", irregular: "0", savings: "0" },
  };
}

function renderAt(url = "/transactions") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <TransactionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchTransactions.mockResolvedValue(listOut([tx()]));
  fetchEvents.mockResolvedValue({ items: [], recurring_due: [] });
});

// 분할(PR M) 전 안전망 — 가계부의 월 합계·내역 목록·일정 보기·조회 실패 표시를 고정한다.
describe("TransactionsPage", () => {
  it("shows this month's totals and the transaction list", async () => {
    renderAt();

    // 캘린더 칸 미리보기 + 아래 한 달 목록 두 군데에 나온다.
    expect((await screen.findAllByText("점심 김밥")).length).toBe(2);
    expect(screen.getByText("수입")).toBeInTheDocument();
    expect(screen.getByText("300만원")).toBeInTheDocument();
    const [filters] = fetchTransactions.mock.calls[0];
    expect(filters.date_from.slice(0, 7)).toBe(TODAY.slice(0, 7));
  });

  it("shows the schedule list for ?view=일정", async () => {
    fetchEvents.mockResolvedValue({
      items: [
        {
          id: 3,
          title: "치과",
          start_at: `${TODAY}T10:00:00`,
          occurrence_start: `${TODAY}T10:00:00`,
          frequency: "once",
          all_day: false,
          completed_at: null,
          creator: ME,
          assignee: null,
        } as unknown as EventOut,
      ],
      recurring_due: [],
    });
    renderAt("/transactions?view=일정");

    expect((await screen.findAllByText("치과")).length).toBeGreaterThan(0);
    expect(screen.queryByText("점심 김밥")).not.toBeInTheDocument();
  });

  it("puts the 내역/일정 tabs above the calendar they switch", async () => {
    renderAt();
    const dayButton = await screen.findByRole("button", { name: formatDayHeader(TODAY) });
    const scheduleTab = screen.getByRole("tab", { name: "일정" });

    expect(scheduleTab.compareDocumentPosition(dayButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("narrows the list below the calendar to the selected day and toggles back to the month", async () => {
    const otherDay = `${TODAY.slice(0, 7)}-${TODAY.endsWith("-01") ? "02" : "01"}`;
    fetchTransactions.mockResolvedValue(
      listOut([tx(), tx({ id: 2, description: "다른 날 커피", transaction_date: otherDay })]),
    );
    renderAt();
    const dayButton = await screen.findByRole("button", { name: formatDayHeader(TODAY) });
    expect(screen.getAllByText("다른 날 커피").length).toBe(2);

    fireEvent.click(dayButton);

    const detail = screen.getByRole("region", { name: `${formatDayHeader(TODAY)} 내역` });
    expect(within(detail).getByText("점심 김밥")).toBeInTheDocument();
    expect(within(detail).queryByText("다른 날 커피")).not.toBeInTheDocument();
    expect(dayButton).toHaveAttribute("aria-pressed", "true");
    // 한 달 목록은 숨는다 — 남은 "다른 날 커피"는 캘린더 칸 미리보기뿐.
    expect(screen.getAllByText("다른 날 커피").length).toBe(1);
    expect(screen.queryByPlaceholderText(/검색/)).not.toBeInTheDocument();

    fireEvent.click(dayButton);
    expect(screen.queryByRole("region", { name: `${formatDayHeader(TODAY)} 내역` })).not.toBeInTheDocument();
    expect(screen.getAllByText("다른 날 커피").length).toBe(2);
  });

  it("opens the add form for the selected day from the day detail", async () => {
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: formatDayHeader(TODAY) }));

    fireEvent.click(screen.getByRole("button", { name: "내역 추가" }));

    expect(screen.getByRole("heading", { name: "내역 추가" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "한 달 전체" }));
    expect(screen.queryByRole("region", { name: `${formatDayHeader(TODAY)} 내역` })).not.toBeInTheDocument();
  });

  it("selects the day from ?date= and shows that day's schedule in the 일정 view", async () => {
    fetchEvents.mockResolvedValue({
      items: [
        {
          id: 3,
          title: "치과",
          start_at: `${TODAY}T10:00:00`,
          occurrence_start: `${TODAY}T10:00:00`,
          frequency: "once",
          all_day: false,
          completed_at: null,
          creator: ME,
          assignee: null,
        } as unknown as EventOut,
      ],
      recurring_due: [],
    });
    renderAt(`/transactions?view=일정&date=${TODAY}`);

    const detail = await screen.findByRole("region", { name: `${formatDayHeader(TODAY)} 일정` });
    expect(await within(detail).findByText("치과")).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "일정 추가" })).toBeInTheDocument();
  });

  it("shows an error, not an empty list, when transactions fail to load", async () => {
    fetchTransactions.mockRejectedValue({ isAxiosError: true, response: { status: 500 } });
    renderAt();

    expect((await screen.findAllByText("내역을 불러오지 못했습니다.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("해당 조건의 내역이 없어요")).not.toBeInTheDocument();
  });
});
