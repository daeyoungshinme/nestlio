import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { toast } from "@/utils/toast";

vi.mock("@/utils/toast", () => ({ toast: vi.fn() }));

function setup(api: Parameters<typeof useCrudMutations<{ name: string }, { name: string }, { id: number }>>[0]["api"]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const onCreateSuccess = vi.fn();
  const onRemoveSuccess = vi.fn();
  const { result } = renderHook(
    () =>
      useCrudMutations<{ name: string }, { name: string }, { id: number }>({
        invalidateKeys: [["a"], ["b", 1]],
        api,
        messages: { create: "추가했습니다.", remove: "삭제했습니다." },
        onCreateSuccess,
        onRemoveSuccess,
      }),
    { wrapper },
  );
  return { result, spy, onCreateSuccess, onRemoveSuccess };
}

describe("useCrudMutations", () => {
  beforeEach(() => vi.mocked(toast).mockClear());

  it("성공하면 모든 키를 무효화하고 성공 토스트와 콜백을 부른다", async () => {
    const { result, spy, onCreateSuccess } = setup({ create: vi.fn(async () => ({ id: 7 })) });

    result.current.createMutation.mutate({ name: "x" });
    await waitFor(() => expect(result.current.createMutation.isSuccess).toBe(true));

    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["a"], ["b", 1]]);
    expect(toast).toHaveBeenCalledWith("추가했습니다.", "success");
    expect(onCreateSuccess).toHaveBeenCalledWith({ id: 7 });
  });

  it("실패하면 무효화·콜백 없이 에러 토스트만", async () => {
    const { result, spy, onRemoveSuccess } = setup({
      remove: vi.fn(async () => {
        throw new Error("삭제 실패");
      }),
    });

    result.current.removeMutation.mutate(3);
    await waitFor(() => expect(result.current.removeMutation.isError).toBe(true));

    expect(spy).not.toHaveBeenCalled();
    expect(onRemoveSuccess).not.toHaveBeenCalled();
    expect(vi.mocked(toast).mock.calls.at(-1)?.[1]).toBe("error");
  });

  it("설정하지 않은 api를 부르면 에러로 끝난다(조용히 성공하지 않음)", async () => {
    const { result } = setup({});

    result.current.updateMutation.mutate({ id: 1, payload: { name: "y" } });
    await waitFor(() => expect(result.current.updateMutation.isError).toBe(true));
  });
});
