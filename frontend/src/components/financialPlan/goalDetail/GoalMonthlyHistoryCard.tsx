import { useState } from "react";
import ShowAllToggle, { DETAIL_LIST_LIMIT } from "@/components/financialPlan/goalDetail/ShowAllToggle";
import { currentYearMonth } from "@/utils/date";
import { formatKrwCompact, formatYearMonth } from "@/utils/format";
import type { GoalMonthlyTargetOut } from "@/types";

/** 월별 달성 기록. 접혀 있으면 이번 달까지 중 최근 DETAIL_LIST_LIMIT개(아직 시작 전이면 처음 몇 달) — 3년 목표면 36행이다. */
export default function GoalMonthlyHistoryCard({ monthlyTargets }: { monthlyTargets: GoalMonthlyTargetOut[] }) {
  const [showAllMonths, setShowAllMonths] = useState(false);
  const thisMonth = currentYearMonth();
  const pastMonths = monthlyTargets.filter((mt) => mt.year_month <= thisMonth);
  const shownMonths = showAllMonths
    ? monthlyTargets
    : pastMonths.length > 0
      ? pastMonths.slice(-DETAIL_LIST_LIMIT)
      : monthlyTargets.slice(0, DETAIL_LIST_LIMIT);
  return (
    <div className="card space-y-2">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">월별 달성 기록</h2>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {shownMonths.map((mt) => (
          <div key={mt.year_month} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              {mt.is_achieved ? "✅ " : ""}
              {formatYearMonth(mt.year_month)}
            </span>
            <span className="tabular-nums text-gray-500 dark:text-gray-400">
              {formatKrwCompact(Number(mt.achieved_amount))} / {formatKrwCompact(Number(mt.target_amount))}
            </span>
          </div>
        ))}
      </div>
      {shownMonths.length < monthlyTargets.length || showAllMonths ? (
        <ShowAllToggle
          expanded={showAllMonths}
          total={monthlyTargets.length}
          onToggle={() => setShowAllMonths((v) => !v)}
        />
      ) : null}
    </div>
  );
}
