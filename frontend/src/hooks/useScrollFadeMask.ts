import { useEffect, useRef, useState } from "react";

const SCROLL_FADE_WIDTH_PX = 24;

/** 탭이 가로로 넘칠 때 화면 밖에 더 있음을 암시하는 페이드를 위해, 실제 스크롤 가능 여부를
 * 배경색과 무관하게 CSS mask-image(진짜 투명도)로 표현한다 — 오버레이 div를 배경색에 맞춰
 * 칠하는 방식은 Tabs·필터 칩이 쓰이는 페이지/모달마다 배경이 달라 색이 어긋날 수 있어 피한다. */
export function useScrollFadeMask<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const maskImage = canScrollLeft || canScrollRight
    ? `linear-gradient(to right, ${canScrollLeft ? "transparent" : "black"}, black ${SCROLL_FADE_WIDTH_PX}px, black calc(100% - ${SCROLL_FADE_WIDTH_PX}px), ${canScrollRight ? "transparent" : "black"})`
    : undefined;

  return { ref, style: maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined };
}
