import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useSwipeMonth } from "@/hooks/useSwipeMonth";

function fireTouch(el: HTMLElement, type: "touchstart" | "touchend", x: number, y: number) {
  const event = new Event(type, { bubbles: true }) as unknown as TouchEvent;
  const touch = { clientX: x, clientY: y } as Touch;
  Object.defineProperty(event, "touches", { value: [touch] });
  Object.defineProperty(event, "changedTouches", { value: [touch] });
  el.dispatchEvent(event);
}

describe("useSwipeMonth", () => {
  beforeEach(() => {
    vi.spyOn(performance, "now").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  function setup(onSwipe: (direction: 1 | -1) => void) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ref = { current: container };
    renderHook(() => useSwipeMonth(ref, onSwipe));
    return container;
  }

  it("triggers next-month (1) on a significant fast left swipe", () => {
    const onSwipe = vi.fn();
    const container = setup(onSwipe);

    fireTouch(container, "touchstart", 200, 100);
    vi.spyOn(performance, "now").mockReturnValue(100);
    fireTouch(container, "touchend", 100, 100);

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith(1);
  });

  it("triggers prev-month (-1) on a significant fast right swipe", () => {
    const onSwipe = vi.fn();
    const container = setup(onSwipe);

    fireTouch(container, "touchstart", 100, 100);
    vi.spyOn(performance, "now").mockReturnValue(100);
    fireTouch(container, "touchend", 200, 100);

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith(-1);
  });

  it("ignores swipes below the distance threshold", () => {
    const onSwipe = vi.fn();
    const container = setup(onSwipe);

    fireTouch(container, "touchstart", 100, 100);
    vi.spyOn(performance, "now").mockReturnValue(100);
    fireTouch(container, "touchend", 120, 100);

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("ignores slow swipes below the velocity threshold", () => {
    const onSwipe = vi.fn();
    const container = setup(onSwipe);

    fireTouch(container, "touchstart", 200, 100);
    vi.spyOn(performance, "now").mockReturnValue(2000);
    fireTouch(container, "touchend", 100, 100);

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("ignores mostly-vertical drags", () => {
    const onSwipe = vi.fn();
    const container = setup(onSwipe);

    fireTouch(container, "touchstart", 200, 100);
    vi.spyOn(performance, "now").mockReturnValue(100);
    fireTouch(container, "touchend", 150, 300);

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("ignores swipes while a modal has locked body scroll", () => {
    const onSwipe = vi.fn();
    const container = setup(onSwipe);
    document.body.style.overflow = "hidden";

    fireTouch(container, "touchstart", 200, 100);
    vi.spyOn(performance, "now").mockReturnValue(100);
    fireTouch(container, "touchend", 100, 100);

    expect(onSwipe).not.toHaveBeenCalled();
  });
});
