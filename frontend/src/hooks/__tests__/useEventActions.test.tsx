import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { EventOut } from "@/types";

const completeEvent = vi.fn();
vi.mock("@/api/events", () => ({
  completeEvent: (...args: unknown[]) => completeEvent(...args),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

const { useEventActions } = await import("@/hooks/useEventActions");

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useEventActions", () => {
  it("완료 토글은 그 회차의 날짜를 함께 보낸다", async () => {
    completeEvent.mockResolvedValue({});
    const { result } = renderHook(() => useEventActions({ users: [] }), { wrapper });

    result.current.toggleComplete({
      id: 3,
      completed_at: null,
      occurrence_start: "2026-07-08T09:00:00",
    } as EventOut);

    await waitFor(() => expect(completeEvent).toHaveBeenCalledWith(3, true, "2026-07-08"));
  });
});
