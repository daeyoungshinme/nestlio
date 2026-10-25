import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useDebouncedValue", () => {
  it("지연 시간 동안 값이 멈춰야 반영하고, 그 사이 입력은 마지막 값만 남긴다", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: "" },
    });

    rerender({ value: "커" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: "커피" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("");

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("커피");
  });
});
