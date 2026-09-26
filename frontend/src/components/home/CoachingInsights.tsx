import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { ROUTES, accountsSectionLink, planAnalysisLink, planViewLink } from "@/constants/routes";
import { insightSeverityStyle } from "@/utils/colors";
import type { InsightOut } from "@/types";

const INSIGHT_LINKS: Partial<Record<string, { to: string; label: string }>> = {
  savings_rate: { to: ROUTES.transactions, label: "가계부 보기" },
  fixed_cost_ratio: { to: ROUTES.transactions, label: "가계부 보기" },
  variable_spend_trend: { to: ROUTES.transactions, label: "가계부 보기" },
  discretionary_ratio: { to: ROUTES.transactions, label: "가계부 보기" },
  debt_ratio: { to: ROUTES.transactions, label: "가계부 보기" },
  category_benchmark: { to: planAnalysisLink(), label: "실적 분석 보기" },
  budget_overrun: { to: planViewLink("이번 달"), label: "이번 달 계획 보기" },
  emergency_fund: { to: accountsSectionLink("저축·투자"), label: "저축·투자 보기" },
  savings_execution: { to: accountsSectionLink("저축·투자"), label: "저축·투자 보기" },
};

const VISIBLE_COUNT = 2;

/** 코칭 알림 — 백엔드가 심각도순으로 정렬해 주므로(coaching_engine.compute_insights) 상위 2개만 보여주고 나머지는
 * 접는다. 구 대시보드는 인사이트를 전부 펼쳐 첫 화면이 경고로 가득 찼다. goal_pace는 목표 히어로가 보여준다. */
export default function CoachingInsights({ insights }: { insights: InsightOut[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = insights.filter((i) => i.rule_code !== "goal_pace");
  if (visible.length === 0) return null;
  const shown = expanded ? visible : visible.slice(0, VISIBLE_COUNT);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">코칭</p>
      {shown.map((insight) => {
        const link = INSIGHT_LINKS[insight.rule_code];
        return (
          <div
            key={`${insight.rule_code}-${insight.message}`}
            className={`border rounded-lg px-4 py-3 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${insightSeverityStyle(insight.severity)}`}
          >
            <span>{insight.message}</span>
            {link && (
              <Link to={link.to} className="shrink-0 text-xs font-semibold underline hover:no-underline min-h-[44px] flex items-center">
                {link.label}
              </Link>
            )}
          </div>
        );
      })}
      {visible.length > VISIBLE_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full flex items-center justify-center gap-1 min-h-[44px] text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          {expanded ? "접기" : `코칭 ${visible.length - VISIBLE_COUNT}개 더 보기`}
          <ChevronDown size={16} className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
