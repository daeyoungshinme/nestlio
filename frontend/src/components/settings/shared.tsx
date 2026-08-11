import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { TOUCH_TARGET_ROW } from "@/constants/uiSizes";

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
        {hint && <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">{hint}</span>}
      </span>
      <ChevronRight size={16} className="text-gray-400 shrink-0" aria-hidden="true" />
    </Link>
  );
}
