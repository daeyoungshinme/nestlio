import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useModalBehavior } from "@/hooks/useModalBehavior";

// 모달이 겹쳐 열렸다 닫힐 때 바깥 모달이 아직 떠 있는데 body 스크롤이 풀리면 배경이 스크롤된다 — 참조 카운트로 막는다.
describe("useModalBehavior", () => {
  it("locks body scroll until the last stacked modal closes, then restores the previous value", () => {
    document.body.style.overflow = "auto";
    const outer = renderHook(() => useModalBehavior(() => {}));
    const inner = renderHook(() => useModalBehavior(() => {}));
    expect(document.body.style.overflow).toBe("hidden");

    inner.unmount();
    expect(document.body.style.overflow).toBe("hidden");

    outer.unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("closes on Escape with the latest onClose", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender, unmount } = renderHook(({ onClose }) => useModalBehavior(onClose), {
      initialProps: { onClose: first },
    });
    rerender({ onClose: latest });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    unmount();
  });
});
