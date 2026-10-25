import { useId } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { TOUCH_TARGET_ROW } from "@/constants/uiSizes";
import { cn } from "@/utils/cn";

/** 설정탭 카드의 공용 래퍼 — 기존에 섹션마다 반복하던 `.card` + 손으로 스타일링한 제목을 대체한다. */
export function SettingsSectionCard({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h2>
        {badge}
      </div>
      {children}
    </div>
  );
}

/** 다른 페이지가 소유한 기능으로 안내하는 요약 행 — "여기서는 편집하지 않고 상태 요약 + 이동"만 담당한다. */
export function SettingsLinkRow({
  to,
  label,
  hint,
}: {
  to: string;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className={`${TOUCH_TARGET_ROW} justify-between gap-2 rounded-lg px-1 -mx-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
    >
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{hint}</span>}
      </span>
      <ChevronRight size={16} className="text-gray-400 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/** 켜고 끄는 설정 한 줄 — 행 전체(44px 이상)가 스위치라 16px 체크박스를 겨냥하지 않아도 된다.
 * 힌트는 자르지 않고 줄바꿈한다(360px에서 뒷부분이 잘려 뜻이 안 통하던 문제). */
export function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={hint ? hintId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-left disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-sm text-gray-700 dark:text-gray-300">{label}</span>
        {hint && (
          <span id={hintId} className="block text-xs text-gray-500 dark:text-gray-400">
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-gray-300 dark:bg-gray-600",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
