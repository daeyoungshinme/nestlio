import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { ROUTES, accountsSectionLink, planAnalysisLink, planViewLink } from "@/constants/routes";
import { insightSeverityStyle } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import type { InsightOut, OwnerOverspendHighlightOut } from "@/types";

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

interface Item {
  key: string;
  message: string;
  severity: InsightOut["severity"];
  link: { to: string; label: string } | undefined;
}

/** 코칭 알림 — 백엔드가 심각도순으로 정렬해 주므로(coaching_engine.compute_insights) 상위 2개만 보여주고 나머지는
 * 접는다. 구 대시보드는 인사이트를 전부 펼쳐 첫 화면이 경고로 가득 찼다. goal_pace는 목표 히어로가 보여준다.
 * 구 "지출 줄이기" 카드의 부부별 증가 지출(owner_overspend_highlights)도 여기 합쳤다 — 같은 "최근 3개월 평균보다
 * 늘었다" 신호를 누가 썼는지까지 보여주므로, 있으면 카테고리 단위 variable_spend_trend 인사이트 대신 쓴다. */
export default function CoachingInsights({
  insights,
  ownerOverspend = [],
}: {
  insights: InsightOut[];
  ownerOverspend?: OwnerOverspendHighlightOut[];
}) {
  const [expanded, setExpanded] = useState(false);
  const insightItems: Item[] = insights
    .filter((i) => i.rule_code !== "goal_pace")
    .filter((i) => !(ownerOverspend.length > 0 && i.rule_code === "variable_spend_trend"))
    .map((i) => ({ key: `${i.rule_code}-${i.message}`, message: i.message, severity: i.severity, link: INSIGHT_LINKS[i.rule_code] }));
  const overspendItems: Item[] = ownerOverspend.map((h) => ({
    key: `overspend-${h.owner_user_id ?? "shared"}-${h.category_name}`,
    message: `${h.display_name} · ${h.category_name} 지출이 최근 3개월 평균보다 ${formatKrw(h.delta)} 늘었어요 — 여기부터 줄이면 저축 여력이 생겨요`,
    severity: "warning",
    link: { to: ROUTES.transactions, label: "가계부 보기" },
  }));
  // critical 인사이트가 먼저, 그다음 부부별 증가 지출, 나머지 인사이트 순.
  const visible = [
    ...insightItems.filter((i) => i.severity === "critical"),
    ...overspendItems,
    ...insightItems.filter((i) => i.severity !== "critical"),
  ];
  if (visible.length === 0) return null;
  const shown = expanded ? visible : visible.slice(0, VISIBLE_COUNT);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">코칭</p>
      {shown.map(({ key, message, severity, link }) => {
        return (
          <div
            key={key}
            className={`border rounded-lg px-4 py-3 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${insightSeverityStyle(severity)}`}
          >
            <span>{message}</span>
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
