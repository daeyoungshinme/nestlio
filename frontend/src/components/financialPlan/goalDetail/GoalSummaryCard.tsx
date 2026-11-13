import ProgressBar from "@/components/common/ProgressBar";
import { progressStatusBadgeClass, progressStatusLabel } from "@/utils/colors";
import { formatKrw, formatKrwCompact, formatPercent, formatYearMonth } from "@/utils/format";
import { computeCardStatus, daysUntil } from "@/utils/goalStatus";
import type { FinancialGoalOut } from "@/types";

/** 목표 상세 맨 위 — 유형·D-day, 진행률, (챌린지가 아니면) 월 계획·예상 달성·수익률 반영 ETA·필요 월 저축액. */
export default function GoalSummaryCard({ goal }: { goal: FinancialGoalOut }) {
  const isChallenge = goal.kind === "challenge";
  const status = computeCardStatus(goal);
  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isChallenge
              ? "챌린지"
              : goal.kind === "net_worth"
                ? `순자산 목표 · 가구 순자산${goal.exclude_real_estate ? "(부동산 제외)" : ""} 기준`
                : goal.kind === "combined"
                  ? "통합 목표 · 장기 목표 + growlio 투자목표 합계"
                  : `${goal.priority}순위 목표`}
            {goal.target_date && ` · D-${daysUntil(goal.target_date)}`}
          </p>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 truncate">{goal.name}</h2>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${progressStatusBadgeClass(status)}`}>
          {progressStatusLabel(status)}
        </span>
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-50">{formatPercent(Number(goal.progress_pct))}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatKrwCompact(Number(goal.current_amount))} / {formatKrwCompact(Number(goal.required_amount))}
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar pct={Number(goal.progress_pct)} />
        </div>
      </div>
      {!isChallenge && (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">월 저축 계획</dt>
            <dd className="font-semibold text-gray-900 dark:text-gray-50">{formatKrw(goal.planned_monthly_amount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500 dark:text-gray-400">예상 달성</dt>
            <dd className="font-semibold text-gray-900 dark:text-gray-50">
              {goal.eta_year_month ? formatYearMonth(goal.eta_year_month) : "계획 필요"}
              {goal.ahead_behind_months !== null && (
                <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                  (목표일보다 {Math.abs(goal.ahead_behind_months)}개월 {goal.ahead_behind_months >= 0 ? "빠름" : "늦음"})
                </span>
              )}
            </dd>
          </div>
          {goal.eta_with_return_year_month && goal.expected_annual_return_pct !== null && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-500 dark:text-gray-400">
                연 {Number(goal.expected_annual_return_pct)}% 수익을 반영하면
              </dt>
              <dd className="font-semibold text-primary-600 dark:text-primary-400">
                {formatYearMonth(goal.eta_with_return_year_month)} 달성 예상
              </dd>
            </div>
          )}
          {goal.suggested_monthly_amount !== null && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-500 dark:text-gray-400">목표일에 맞추려면 매달</dt>
              <dd className="font-semibold text-gray-900 dark:text-gray-50">{formatKrw(goal.suggested_monthly_amount)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
