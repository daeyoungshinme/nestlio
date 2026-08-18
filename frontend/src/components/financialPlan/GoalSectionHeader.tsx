import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
}

/** 목표탭의 섹션(가구 저축 페이스/재무목표 — 부부 챌린지는 재무목표에 흡수됨)이 공유하는 헤더 —
 * 섹션마다 제각각이던 소제목 스타일을 통일해 페이지에 실제 그룹 경계를 만든다. */
export default function GoalSectionHeader({ title, description, action }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">{title}</h2>
        {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
