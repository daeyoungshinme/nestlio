import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PERSIST_CACHE_KEY } from "@/constants/queryConfig";
import { clearClientCaches } from "@/utils/session";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("clearClientCaches", () => {
  it("메모리 쿼리 캐시와 영속화된 쿼리 캐시를 모두 비운다", () => {
    const client = new QueryClient();
    client.setQueryData(["dashboard", "2026-08"], { total: 1 });
    localStorage.setItem(PERSIST_CACHE_KEY, "{}");
    localStorage.setItem("nestlio:other", "keep");

    clearClientCaches(client);

    expect(client.getQueryData(["dashboard", "2026-08"])).toBeUndefined();
    expect(localStorage.getItem(PERSIST_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem("nestlio:other")).toBe("keep");
  });

  it("localStorage 접근이 막혀도 메모리 캐시는 비우고 던지지 않는다", () => {
    const client = new QueryClient();
    client.setQueryData(["x"], 1);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(() => clearClientCaches(client)).not.toThrow();
    expect(client.getQueryData(["x"])).toBeUndefined();
  });
});
