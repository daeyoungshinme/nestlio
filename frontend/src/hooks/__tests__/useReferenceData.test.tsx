import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useSpouse } from "@/hooks/useReferenceData";

const fetchMe = vi.fn();
const fetchUsers = vi.fn();
vi.mock("@/api/users", () => ({
  fetchMe: (...args: unknown[]) => fetchMe(...args),
  fetchUsers: (...args: unknown[]) => fetchUsers(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const me = { id: "u1", email: "a@x.com", display_name: "나" };
const spouse = { id: "u2", email: "b@x.com", display_name: "배우자" };

describe("useSpouse", () => {
  it("returns the household member who is not me", async () => {
    fetchMe.mockResolvedValue(me);
    fetchUsers.mockResolvedValue([me, spouse]);
    const { result } = renderHook(() => useSpouse(), { wrapper });
    await waitFor(() => expect(result.current).toEqual(spouse));
  });

  it("is undefined while I live alone in the household", async () => {
    fetchMe.mockResolvedValue(me);
    fetchUsers.mockResolvedValue([me]);
    const { result } = renderHook(() => useSpouse(), { wrapper });
    await waitFor(() => expect(fetchUsers).toHaveBeenCalled());
    expect(result.current).toBeUndefined();
  });
});
