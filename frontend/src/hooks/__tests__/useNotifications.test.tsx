import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { NOTIFICATIONS_REFETCH_INTERVAL } from "@/constants/queryConfig";
import { QUERY_KEYS } from "@/constants/queryKeys";

const fetchNotifications = vi.fn(async () => ({ items: [], unread_count: 0 }));
vi.mock("@/api/notifications", () => ({ fetchNotifications: () => fetchNotifications() }));

const { useNotifications } = await import("@/hooks/useNotifications");

describe("useNotifications", () => {
  it("헤더·홈·목표 상세가 공유하는 키와 폴링 주기로 조회한다", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData(QUERY_KEYS.notifications)).toEqual({ items: [], unread_count: 0 });
    const query = client.getQueryCache().find({ queryKey: QUERY_KEYS.notifications });
    expect(query?.observers[0]?.options.refetchInterval).toBe(NOTIFICATIONS_REFETCH_INTERVAL);
  });
});
