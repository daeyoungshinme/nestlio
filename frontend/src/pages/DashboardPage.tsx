import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Tabs from "@/components/common/Tabs";
import SummaryCards from "@/components/common/SummaryCards";
import SkeletonCard from "@/components/common/SkeletonCard";
import EmptyState from "@/components/common/EmptyState";
import ProgressBar from "@/components/common/ProgressBar";
import { fetchDashboard } from "@/api/dashboard";
import { fetchNetWorth } from "@/api/netWorth";
import { fetchSettings } from "@/api/settings";
import { fetchGoals } from "@/api/goals";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { insightSeverityStyle } from "@/utils/colors";
import { formatKrw, formatPercent } from "@/utils/format";
import type { DashboardPeriod } from "@/types";
import { Target } from "lucide-react";

const PERIOD_TABS: DashboardPeriod[] = ["today", "week", "month"];
const PERIOD_LABEL: Record<DashboardPeriod, string> = { today: "오늘", week: "이번주", month: "이번달" };
const INSIGHTS_COLLAPSED_COUNT = 2;

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [showAllInsights, setShowAllInsights] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.dashboard(period),
    queryFn: () => fetchDashboard(period),
    staleTime: STALE_TIME.SHORT,
  });
  const { data: settingsData } = useQuery({ queryKey: QUERY_KEYS.settings, queryFn: fetchSettings });
  const { data: netWorth } = useQuery({ queryKey: QUERY_KEYS.netWorth, queryFn: () => fetchNetWorth() });
  const { data: goals } = useQuery({ queryKey: QUERY_KEYS.financialGoals, queryFn: fetchGoals });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <SkeletonCard rows={2} />
        <SkeletonCard rows={4} />
      </div>
    );
  }

  const topGoal = goals?.length ? goals.slice().sort((a, b) => a.priority - b.priority)[0] : null;
  const goalPaceInsight = data.insights.find((i) => i.rule_code === "goal_pace");
  const visibleInsights = showAllInsights ? data.insights : data.insights.slice(0, INSIGHTS_COLLAPSED_COUNT);
  const maxUserSavings = Math.max(0, ...data.by_user.map((u) => Number(u.savings)));

  return (
    <div className="space-y-6">
      {settingsData?.couple_photo_url && (
        <div className="rounded-xl overflow-hidden h-40 lg:h-56">
          <img
            src={settingsData.couple_photo_url}
            alt="부부 사진"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">대시보드</h1>
        <Tabs
          tabs={PERIOD_TABS.map((p) => PERIOD_LABEL[p])}
          activeTab={PERIOD_LABEL[period]}
          onChange={(label) => {
            const found = PERIOD_TABS.find((p) => PERIOD_LABEL[p] === label);
            if (found) setPeriod(found);
          }}
          variant="pill"
        />
      </div>

      <SummaryCards totals={data.totals} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Link to="/financial-plan?tab=재무목표" className="card block hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">우리 부부 목표</h3>
          {!topGoal ? (
            <EmptyState
              icon={Target}
              title="아직 목표가 없어요"
              description="목표 탭에서 첫 재무목표를 세워보세요"
              compact
            />
          ) : (
            <>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1">{topGoal.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {formatKrw(topGoal.current_amount)} / {formatKrw(topGoal.required_amount)}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <ProgressBar pct={Number(topGoal.progress_pct)} />
                </div>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                  {formatPercent(Number(topGoal.progress_pct))} 달성
                </span>
              </div>
              {goalPaceInsight && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{goalPaceInsight.message}</p>
              )}
            </>
          )}
        </Link>

        <Link to="/accounts" className="card block hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">순자산</h3>
          {!netWorth ? (
            <SkeletonCard rows={2} />
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-3">
                {formatKrw(netWorth.current.net_worth)}
              </p>
              <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex justify-between">
                  <span>계좌</span>
                  <span>{formatKrw(netWorth.current.accounts_total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>저축·투자</span>
                  <span>{formatKrw(netWorth.current.savings_total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>대출</span>
                  <span>-{formatKrw(netWorth.current.loans_total)}</span>
                </div>
              </div>
            </>
          )}
        </Link>
      </div>

      {data.by_user.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">이번 기간 배우자 기여</h3>
          <div className="space-y-3">
            {data.by_user.map((u) => (
              <div key={u.user_id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-900 dark:text-gray-50">{u.display_name}</span>
                  <span className="text-gray-500 dark:text-gray-400">저축 {formatKrw(u.savings)}</span>
                </div>
                <ProgressBar pct={maxUserSavings > 0 ? (Math.max(0, Number(u.savings)) / maxUserSavings) * 100 : 0} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          {data.current_ym} 자산증식 코칭
        </h3>
        {data.insights.length === 0 ? (
          <EmptyState title="아직 표시할 코칭이 없어요" compact />
        ) : (
          <div className="space-y-2">
            {visibleInsights.map((insight, i) => (
              <div
                key={i}
                className={`border rounded-lg px-4 py-3 text-sm ${insightSeverityStyle(insight.severity)}`}
              >
                {insight.message}
              </div>
            ))}
            {data.insights.length > INSIGHTS_COLLAPSED_COUNT && (
              <button
                onClick={() => setShowAllInsights((v) => !v)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-1"
              >
                {showAllInsights ? "간략히 보기" : `코칭 ${data.insights.length - INSIGHTS_COLLAPSED_COUNT}개 더보기`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
