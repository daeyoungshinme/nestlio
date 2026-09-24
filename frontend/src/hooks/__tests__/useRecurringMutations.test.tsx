import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useRecurringMutations } from "../useRecurringMutations";

vi.mock("@/api/recurring", () => ({
  createRecurring: vi.fn(async () => ({ id: 1 })),
  updateRecurring: vi.fn(async () => ({ id: 1 })),
  deactivateRecurring: vi.fn(async () => undefined),
  reactivateRecurring: vi.fn(async () => ({ id: 1 })),
}));

describe("useRecurringMutations", () => {
  it("invalidates every view derived from recurring rules, regardless of caller", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRecurringMutations(), { wrapper });
    result.current.reactivateMutation.mutate(1);
    await waitFor(() => expect(result.current.reactivateMutation.isSuccess).toBe(true));

    const invalidated = spy.mock.calls.map(([filters]) => filters?.queryKey);
    for (const key of [
      QUERY_KEYS.recurring,
      // 모든 월의 캘린더 recurring_due 배지, 현금흐름계획 연결 배지(recurring_active), 대시보드 코칭
      QUERY_KEYS.eventsAll,
      QUERY_KEYS.cashflowPlanAll,
      QUERY_KEYS.dashboardAll,
    ]) {
      expect(invalidated).toContainEqual(key);
    }
  });
});
