import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMutationCache, invalidateKeys } from "@/utils/queryClient";
import { toast } from "@/utils/toast";

vi.mock("@/utils/toast", () => ({ toast: vi.fn() }));

describe("invalidateKeys", () => {
  it("넘긴 키를 순서대로 모두 무효화한다", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");

    invalidateKeys(client, [["a"], ["b", 1]]);

    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["a"], ["b", 1]]);
  });
});

describe("createMutationCache", () => {
  beforeEach(() => vi.mocked(toast).mockClear());

  const failing = async () => {
    throw new Error("저장 실패");
  };

  it("자체 onError가 없으면 서버 메시지를 에러 토스트로 띄운다", async () => {
    const client = new QueryClient({ mutationCache: createMutationCache() });

    await expect(client.getMutationCache().build(client, { mutationFn: failing }).execute(undefined)).rejects.toThrow();

    expect(toast).toHaveBeenCalledWith("저장 실패", "error");
  });

  it("자체 onError가 있으면 전역 토스트를 띄우지 않는다(중복 방지)", async () => {
    const client = new QueryClient({ mutationCache: createMutationCache() });
    const onError = vi.fn();

    await expect(
      client.getMutationCache().build(client, { mutationFn: failing, onError }).execute(undefined),
    ).rejects.toThrow();

    expect(onError).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
