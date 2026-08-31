import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import ProgressBar from "@/components/common/ProgressBar";
import RowActionButtons from "@/components/common/RowActionButtons";
import StatusBadge from "@/components/common/StatusBadge";
import { formatPercent } from "@/utils/format";

export interface GoalProgressCardBadge {
  label: string;
  toneClassName: string;
  icon?: ReactNode;
}

export interface GoalProgressCardExtraDetail {
  key: string;
  content: ReactNode;
}

interface Props {
  title: string;
  metaLine?: string;
  badges?: GoalProgressCardBadge[];
  subtitle?: ReactNode;
  pct: number;
  primaryDetail?: ReactNode;
  /** primaryDetail 바로 아래, 접이식 extraDetails와 무관하게 항상 보이는 고정 정보 — 중요도가
   * 높아 "더보기" 뒤에 숨기면 안 되는 것만 담는다(남용하면 카드가 다시 길어진다). */
  pinnedDetail?: ReactNode;
  extraDetails?: GoalProgressCardExtraDetail[];
  onEdit?: () => void;
  onDelete?: () => void;
  footer?: ReactNode;
  className?: string;
}

/** 재무목표/챌린지가 공유하는 진행카드 — 배지+진행바+금액 표시 패턴을 한 곳에 모았다.
 * extraDetails가 0개면 아무것도 안 보이고, 1개면 바로 인라인으로, 2개 이상이면
 * 더보기 접이식으로 묶는다 — 카드마다 조건부
 * 문구가 들쭉날쭉 쌓이던 문제를 하나의 disclosure 패턴으로 수렴시킨다. */
export default function GoalProgressCard({
  title,
  metaLine,
  badges,
  subtitle,
  pct,
  primaryDetail,
  pinnedDetail,
  extraDetails,
  onEdit,
  onDelete,
  footer,
  className,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const details = extraDetails ?? [];

  return (
    <div className={`card space-y-2 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {metaLine && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{metaLine}</p>}
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{title}</p>
            {badges?.map((badge, i) => (
              <StatusBadge key={i} label={badge.label} toneClassName={badge.toneClassName} icon={badge.icon} />
            ))}
          </div>
          {subtitle}
        </div>
        {onDelete && <RowActionButtons onEdit={onEdit} onDelete={onDelete} />}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <ProgressBar pct={pct} />
        </div>
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
          {formatPercent(pct)}
        </span>
      </div>

      {primaryDetail && <p className="text-xs text-gray-500 dark:text-gray-400">{primaryDetail}</p>}

      {pinnedDetail && <div className="text-xs">{pinnedDetail}</div>}

      {details.length === 1 && <div className="text-xs text-gray-500 dark:text-gray-400">{details[0].content}</div>}

      {details.length >= 2 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="w-full flex items-center justify-between gap-2 min-h-[36px] text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <span>더보기</span>
            <ChevronDown
              size={14}
              className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </button>
          {expanded && (
            <div className="space-y-1 pt-1">
              {details.map((d) => (
                <div key={d.key} className="text-xs text-gray-500 dark:text-gray-400">
                  {d.content}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {footer}
    </div>
  );
}
