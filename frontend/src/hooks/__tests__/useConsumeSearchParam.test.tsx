import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useConsumeSearchParam } from "@/hooks/useConsumeSearchParam";

function setup(initialUrl: string, onValue: (value: string) => void) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => {
      useConsumeSearchParam("date", onValue);
      return useLocation();
    },
    { wrapper },
  );
}

describe("useConsumeSearchParam", () => {
  it("값을 한 번 넘기고 그 파라미터만 URL에서 지운다", async () => {
    const onValue = vi.fn();
    const { result } = setup("/transactions?date=2026-08-15&view=달력", onValue);

    await waitFor(() => expect(result.current.search).toBe(`?view=${encodeURIComponent("달력")}`));
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith("2026-08-15");
  });

  it("파라미터가 없으면 아무것도 하지 않는다", () => {
    const onValue = vi.fn();
    const { result } = setup("/transactions?view=내역", onValue);

    expect(onValue).not.toHaveBeenCalled();
    expect(result.current.search).toBe("?view=내역");
  });
});
