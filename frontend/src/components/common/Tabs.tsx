import { useEffect, useRef, useState } from "react";
import { TOUCH_TARGET_MIN } from "@/constants/uiSizes";

type Variant = "underline" | "pill";

const SCROLL_FADE_WIDTH_PX = 24;

/** 탭이 가로로 넘칠 때 화면 밖에 더 있음을 암시하는 페이드를 위해, 실제 스크롤 가능 여부를
 * 배경색과 무관하게 CSS mask-image(진짜 투명도)로 표현한다 — 오버레이 div를 배경색에 맞춰
 * 칠하는 방식은 Tabs가 쓰이는 페이지/모달마다 배경이 달라 색이 어긋날 수 있어 피한다. */
function useScrollFadeMask<T extends HTMLElement>() {
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

interface Props<T extends string> {
  tabs: readonly T[];
  activeTab: T;
  onChange: (tab: T) => void;
  variant?: Variant;
  className?: string;
  fullWidth?: boolean;
}

export default function Tabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  variant = "underline",
  className,
  fullWidth,
}: Props<T>) {
  const { ref: scrollFadeRef, style: scrollFadeStyle } = useScrollFadeMask<HTMLDivElement>();

  if (variant === "pill") {
    return (
      <div
        ref={scrollFadeRef}
        role="tablist"
        style={scrollFadeStyle}
        className={`flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 overflow-x-auto scrollbar-none [scroll-snap-type:x_mandatory] ${fullWidth ? "w-full sm:w-fit" : ""} ${className ?? ""}`}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => onChange(tab)}
            className={[
              "px-3 sm:px-5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap [scroll-snap-align:start]",
              fullWidth ? "flex-1 sm:flex-none" : "shrink-0",
              TOUCH_TARGET_MIN,
              activeTab === tab
                ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-50"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
            ].join(" ")}
          >
            {tab}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={scrollFadeRef}
      role="tablist"
      style={scrollFadeStyle}
      className={`flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-none ${className ?? ""}`}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={activeTab === tab}
          tabIndex={activeTab === tab ? 0 : -1}
          onClick={() => onChange(tab)}
          className={[
            "px-4 py-2 text-sm transition-colors border-b-2 -mb-px whitespace-nowrap shrink-0",
            TOUCH_TARGET_MIN,
            activeTab === tab
              ? "border-blue-600 text-blue-600 dark:text-blue-400 font-semibold dark:border-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300",
          ].join(" ")}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
