import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAssetSection } from "@/hooks/useAssetSection";

vi.mock("@/utils/toast", () => ({ toast: vi.fn() }));

// 계좌처럼 행이 { account: { id } } 래퍼여도 getId로 꺼낸 서버 id가 수정·비활성화·동기화에 쓰여야 한다.
type Row = { account: { id: number } };

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const api = {
    create: vi.fn(async (_payload: { initial: string }) => ({})),
    update: vi.fn(async (_id: number, _payload: { current: string }) => ({})),
    deactivate: vi.fn(async (_id: number) => ({})),
    sync: vi.fn(async (_id: number) => ({})),
  };
  const { result } = renderHook(
    () =>
      useAssetSection<Row, { initial: string }, { current: string }>({
        api,
        getId: (row) => row.account.id,
        messages: { create: "추가", sync: "동기화" },
      }),
    { wrapper },
  );
  return { result, api };
}

describe("useAssetSection", () => {
  it("신규 폼은 create 페이로드로, 수정 폼은 그 행 id + update 페이로드로 보내고 성공하면 폼을 닫는다", async () => {
    const { result, api } = setup();

    act(() => result.current.openNew());
    expect(result.current.isNew).toBe(true);
    act(() => result.current.submit({ initial: "1" }, { current: "2" }));
    await waitFor(() => expect(result.current.formTarget).toBeNull());
    expect(api.create.mock.calls[0][0]).toEqual({ initial: "1" });

    act(() => result.current.openEdit({ account: { id: 42 } }));
    expect(result.current.editing).toEqual({ account: { id: 42 } });
    act(() => result.current.submit({ initial: "1" }, { current: "2" }));
    await waitFor(() => expect(result.current.formTarget).toBeNull());
    expect(api.update).toHaveBeenCalledWith(42, { current: "2" });
  });

  it("비활성화 확인과 동기화는 getId로 꺼낸 id를 쓴다", async () => {
    const { result, api } = setup();

    act(() => result.current.askDeactivate({ account: { id: 7 } }));
    expect(result.current.deactivateTarget).toBe(7);
    act(() => result.current.confirmDeactivate());
    await waitFor(() => expect(result.current.deactivateTarget).toBeNull());
    expect(api.deactivate.mock.calls[0][0]).toBe(7);

    act(() => result.current.sync({ account: { id: 9 } }));
    await waitFor(() => expect(api.sync).toHaveBeenCalled());
    expect(api.sync.mock.calls[0][0]).toBe(9);
  });
});
