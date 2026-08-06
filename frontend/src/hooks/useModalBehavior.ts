import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// 모달이 겹쳐 열릴 수 있으므로 참조 카운트로 body 스크롤 잠금을 관리한다.
let bodyLockCount = 0;
let savedBodyOverflow = "";

/** 이 값 이상 아래로 드래그한 채 손을 떼면 바텀시트를 닫는다. */
const DRAG_CLOSE_THRESHOLD_PX = 80;

export function useModalBehavior(onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (bodyLockCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    bodyLockCount++;
    return () => {
      bodyLockCount--;
      if (bodyLockCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
      }
    };
  }, []);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog) {
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
      focusable[0]?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const els = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (els.length === 0) return;
      if (e.shiftKey) {
        if (document.activeElement === els[0]) {
          e.preventDefault();
          els[els.length - 1].focus();
        }
      } else {
        if (document.activeElement === els[els.length - 1]) {
          e.preventDefault();
          els[0].focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      prevFocus?.focus();
    };
  }, []);

  // iOS Safari는 body overflow:hidden만으로는 배경(오버레이) 터치 드래그 시 뷰포트 바운스를
  // 막지 못한다. dialog 내부(폼 스크롤 영역 등)로 향하는 touchmove는 통과시키고, 오버레이
  // 자체(배경)로 향하는 것만 막는다. React의 합성 터치 이벤트는 기본 passive라 preventDefault가
  // 먹지 않으므로 네이티브 리스너를 직접 붙인다.
  useEffect(() => {
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (dialog && e.target instanceof Node && dialog.contains(e.target)) return;
      e.preventDefault();
    };

    overlay.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => overlay.removeEventListener("touchmove", handleTouchMove);
  }, []);

  // 바텀시트 핸들 바를 아래로 threshold 이상 드래그하면 닫는다. 폼 내부 스크롤/탭 피드백과의
  // 제스처 경합을 피하기 위해 드래그 시작을 핸들 요소로만 한정한다(dialog 전체가 아님).
  useEffect(() => {
    const handle = handleRef.current;
    const dialog = dialogRef.current;
    if (!handle || !dialog) return;

    let startY = 0;
    let dragging = false;

    const settle = (dragDistance: number) => {
      dragging = false;
      dialog.style.transition = "transform 0.2s ease-out";
      dialog.style.transform = "";
      if (dragDistance > DRAG_CLOSE_THRESHOLD_PX) {
        onCloseRef.current();
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      dragging = true;
      dialog.style.transition = "none";
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!dragging) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) return;
      e.preventDefault();
      dialog.style.transform = `translateY(${delta}px)`;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (!dragging) return;
      settle(e.changedTouches[0].clientY - startY);
    };
    const handleTouchCancel = () => {
      if (!dragging) return;
      settle(0);
    };

    handle.addEventListener("touchstart", handleTouchStart, { passive: true });
    handle.addEventListener("touchmove", handleTouchMove, { passive: false });
    handle.addEventListener("touchend", handleTouchEnd);
    handle.addEventListener("touchcancel", handleTouchCancel);
    return () => {
      handle.removeEventListener("touchstart", handleTouchStart);
      handle.removeEventListener("touchmove", handleTouchMove);
      handle.removeEventListener("touchend", handleTouchEnd);
      handle.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, []);

  return { dialogRef, overlayRef, handleRef };
}
