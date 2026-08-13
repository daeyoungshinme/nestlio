import { useEffect, useState } from "react";
import type { ToastEvent } from "@/utils/toast";
import { Z_TOASTER } from "@/constants/zIndex";
import { BOTTOM_NAV_HEIGHT_PX } from "@/constants/uiSizes";

const COLORS: Record<string, string> = {
  error: "bg-red-600",
  success: "bg-green-600",
  info: "bg-blue-600",
};

const MAX_TOASTS = 3;

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
    window.addEventListener("nestlio:toast", handler);
    return () => window.removeEventListener("nestlio:toast", handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className={`fixed bottom-[calc(${BOTTOM_NAV_HEIGHT_PX}px+0.75rem+env(safe-area-inset-bottom))] right-3 lg:bottom-5 lg:right-5 ${Z_TOASTER} flex flex-col gap-2 pointer-events-none`}
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
              className="font-medium underline underline-offset-2 shrink-0"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
