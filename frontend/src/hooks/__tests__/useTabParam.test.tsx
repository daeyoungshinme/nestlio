import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useTabParam } from "@/hooks/useTabParam";

const TABS = ["소비", "보험"] as const;

function setup(initialUrl: string, options?: Parameters<typeof useTabParam>[3]) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => {
      const [active, change, fromUrl] = useTabParam("tab", TABS, "소비", options);
      return { active, change, fromUrl, location: useLocation() };
    },
    { wrapper },
  );
}

describe("useTabParam", () => {
  it("URL의 유효한 탭을 고르고, 바꾸면 그 파라미터만 고친다", () => {
    const { result } = setup("/review?tab=보험&month=2026-10");
    expect(result.current.active).toBe("보험");
    expect(result.current.fromUrl).toBe(true);

    act(() => result.current.change("소비"));
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get("tab")).toBe("소비");
    expect(params.get("month")).toBe("2026-10");
  });

  it("없거나 모르는 값이면 기본 탭이고 URL은 그대로 둔다", () => {
    const { result } = setup("/review?tab=없는탭");
    expect(result.current.active).toBe("소비");
    expect(result.current.fromUrl).toBe(false);
    expect(new URLSearchParams(result.current.location.search).get("tab")).toBe("없는탭");
  });

  it("pinDefault면 파라미터 없이 들어올 때 기본 탭을 URL에 써 둔다", async () => {
    const { result } = setup("/review", { pinDefault: true });
    await waitFor(() => expect(new URLSearchParams(result.current.location.search).get("tab")).toBe("소비"));
  });

  it("예전 파라미터 이름도 읽는다(새 이름이 있으면 그것만)", () => {
    expect(setup("/review?legacy=보험", { legacyKeys: ["legacy"] }).result.current.active).toBe("보험");
    expect(setup("/review?tab=소비&legacy=보험", { legacyKeys: ["legacy"] }).result.current.active).toBe("소비");
  });
});
