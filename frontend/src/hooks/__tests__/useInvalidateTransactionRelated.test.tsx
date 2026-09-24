import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useInvalidateTransactionRelated } from "../useInvalidateTransactionRelated";

describe("useInvalidateTransactionRelated", () => {
  it("invalidates caches the backend derives from transactions (account balances, goal progress, reports)", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useInvalidateTransactionRelated(), { wrapper });
    result.current();

    const invalidated = spy.mock.calls.map(([filters]) => filters?.queryKey);
    for (const key of [
      QUERY_KEYS.transactionsAll,
      QUERY_KEYS.netWorthAll,
      QUERY_KEYS.accounts,
      QUERY_KEYS.financialGoals,
      QUERY_KEYS.recentTransactionsAll,
      QUERY_KEYS.yearlyReportAll,
      QUERY_KEYS.categoryTrendAll,
      QUERY_KEYS.monthlyRetrospective,
    ]) {
      expect(invalidated).toContainEqual(key);
    }
  });
});
