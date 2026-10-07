import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useLedgerMonth } from "@/hooks/useLedgerMonth";

const fetchTransactions = vi.fn();
const fetchEvents = vi.fn();
vi.mock("@/api/transactions", () => ({ fetchTransactions: (...args: unknown[]) => fetchTransactions(...args) }));
vi.mock("@/api/events", () => ({ fetchEvents: (...args: unknown[]) => fetchEvents(...args) }));

const tx = (id: number, date: string, amount: string, isSavings = false) => ({
  id,
  transaction_date: date,
  amount,
  category: { is_savings: isSavings },
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useLedgerMonth", () => {
  it("queries the month bounds and groups transactions/events/recurring by local date", async () => {
    fetchTransactions.mockResolvedValue({
      items: [tx(1, "2026-07-05", "10000"), tx(2, "2026-07-05", "300000", true), tx(3, "2026-07-09", "5000")],
      totals: { income: "0", expense: "15000" },
    });
    fetchEvents.mockResolvedValue({
      items: [{ id: 10, occurrence_start: "2026-07-09T10:00:00" }],
      recurring_due: [{ id: 20, next_due_date: "2026-07-25" }],
    });

    const { result } = renderHook(() => useLedgerMonth("2026-07", "점심"), { wrapper });
    await waitFor(() => expect(result.current.eventsQuery.isSuccess && result.current.transactionsQuery.isSuccess).toBe(true));

    expect(fetchTransactions).toHaveBeenCalledWith({ date_from: "2026-07-01", date_to: "2026-07-31", q: "점심" });
    expect(fetchEvents).toHaveBeenCalledWith("2026-07-01", "2026-07-31");
    expect(result.current.transactionsByDate.get("2026-07-05")?.map((t) => t.id)).toEqual([1, 2]);
    expect(result.current.eventsByDate.get("2026-07-09")?.map((e) => e.id)).toEqual([10]);
    expect(result.current.recurringDueByDate.get("2026-07-25")?.map((r) => r.id)).toEqual([20]);
    // 저축 카테고리 거래만 저축 합계에 잡힌다.
    expect(result.current.savingsTotal).toBe(300000);
  });

  it("omits an empty search query from the request", async () => {
    fetchTransactions.mockResolvedValue({ items: [], totals: null });
    fetchEvents.mockResolvedValue({ items: [], recurring_due: [] });

    renderHook(() => useLedgerMonth("2026-02", ""), { wrapper });
    await waitFor(() => expect(fetchTransactions).toHaveBeenCalledWith({ date_from: "2026-02-01", date_to: "2026-02-28", q: undefined }));
  });
});
