import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";

const SWIPE_THRESHOLD = 50; // px
const VELOCITY_THRESHOLD = 0.3; // px/ms
const ANGLE_RATIO = 1.5; // 수평 이동량이 수직 이동량보다 이 배 이상이어야 스와이프로 인정

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
}

/**
 * 가계부 캘린더 영역의 좌우 스와이프로 월을 이동한다. 왼쪽 스와이프(1)는 다음 달,
 * 오른쪽 스와이프(-1)는 이전 달을 의미한다. 모달이 열려 body 스크롤이 잠겨 있는
 * 동안(useModalBehavior)에는 무시해 캘린더 아래 모달 내부 스와이프와 충돌하지 않는다.
 */
export function useSwipeMonth(containerRef: RefObject<HTMLElement | null>, onSwipe: (direction: 1 | -1) => void) {
  const touchRef = useRef<TouchState | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startTime: performance.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      const start = touchRef.current;
      touchRef.current = null;
      if (!start) return;

      if (document.body.style.overflow === "hidden") return;

      const deltaX = e.changedTouches[0].clientX - start.startX;
      const deltaY = e.changedTouches[0].clientY - start.startY;
      const elapsed = performance.now() - start.startTime;
      const velocity = Math.abs(deltaX) / elapsed;

      const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * ANGLE_RATIO;
      const isSignificant = Math.abs(deltaX) > SWIPE_THRESHOLD && velocity > VELOCITY_THRESHOLD;
      if (!isHorizontal || !isSignificant) return;

      onSwipe(deltaX < 0 ? 1 : -1);
    },
    [onSwipe],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [containerRef, handleTouchStart, handleTouchEnd]);
}
