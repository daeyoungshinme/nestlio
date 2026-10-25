import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ToastEvent } from "@/utils/toast";
import { APP_EVENTS } from "@/constants/events";
import { Z_TOASTER } from "@/constants/zIndex";
import { BOTTOM_NAV_HEIGHT_PX, TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";

const COLORS: Record<string, string> = {
  error: "bg-red-600",
  success: "bg-primary",
  info: "bg-primary-600",
};

const MAX_TOASTS = 3;

// Tailwind는 소스에 문자 그대로 있는 클래스만 생성하므로 `bottom-[calc(${...}px...)]`처럼
// 보간한 임의값 클래스는 CSS가 만들어지지 않는다. QuickAddFab과 같이 CSS 변수로 넘긴다.
const TOAST_BOTTOM_STYLE = {
  "--toast-bottom-mobile": `calc(${BOTTOM_NAV_HEIGHT_PX}px + 0.75rem + env(safe-area-inset-bottom))`,
} as CSSProperties;

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastEvent>).detail;
      setToasts((prev) => [...prev, detail].slice(-MAX_TOASTS));
      setTimeout(
        () => {
          setToasts((prev) => prev.filter((t) => t.id !== detail.id));
        },
        detail.action ? 6000 : 3500,
      );
    };
    window.addEventListener(APP_EVENTS.toast, handler);
    return () => window.removeEventListener(APP_EVENTS.toast, handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={TOAST_BOTTOM_STYLE}
      // 모바일에선 오른쪽 아래 FAB(right-4 + 56px)를 비켜 그 왼쪽까지만 쓴다 — "취소" 토스트가 6초간 +버튼을 가리지 않게.
      className={`fixed bottom-[var(--toast-bottom-mobile)] left-3 right-[5.25rem] items-end lg:left-auto lg:bottom-5 lg:right-5 ${Z_TOASTER} flex flex-col gap-2 pointer-events-none`}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === "error" ? "alert" : "status"}
          aria-live={t.type === "error" ? "assertive" : "polite"}
          className={`${COLORS[t.type]} text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3 pointer-events-auto`}
        >
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action?.onClick();
                setToasts((prev) => prev.filter((toastItem) => toastItem.id !== t.id));
              }}
              className={`${TOUCH_TARGET_MIN_HEIGHT} -my-2 px-2 -mr-2 font-medium underline underline-offset-2 shrink-0`}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
