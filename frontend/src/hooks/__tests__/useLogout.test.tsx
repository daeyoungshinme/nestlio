import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const logout = vi.fn(async () => {
  calls.push("logout");
});
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: { logout: typeof logout }) => unknown) => select({ logout }),
}));
vi.mock("@/utils/session", () => ({
  clearClientCaches: vi.fn(() => {
    calls.push("clearClientCaches");
  }),
}));

const { useLogout } = await import("@/hooks/useLogout");
const { clearClientCaches } = await import("@/utils/session");

describe("useLogout", () => {
  it("쿼리 캐시를 먼저 비운 뒤 로그아웃한다(다음 로그인 화면에 이전 데이터가 남지 않게)", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLogout(), { wrapper });

    await result.current();

    expect(clearClientCaches).toHaveBeenCalledWith(client);
    expect(calls).toEqual(["clearClientCaches", "logout"]);
  });
});
