import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import Tabs from "@/components/common/Tabs";
import MonthPicker, { currentYearMonth } from "@/components/common/MonthPicker";
import DayPicker, { currentDateIso } from "@/components/common/DayPicker";
import WeekPicker, { currentWeekAnchor } from "@/components/common/WeekPicker";
import MonthlyRetrospectiveCard from "@/components/dashboard/MonthlyRetrospectiveCard";
import SummaryCards from "@/components/common/SummaryCards";
import SkeletonCard from "@/components/common/SkeletonCard";
import EmptyState from "@/components/common/EmptyState";
import ProgressBar from "@/components/common/ProgressBar";
import Modal from "@/components/common/Modal";
import QuickAddFab from "@/components/common/QuickAddFab";
import TransactionForm from "@/components/transactions/TransactionForm";
import { fetchDashboard } from "@/api/dashboard";
import { fetchNetWorth } from "@/api/netWorth";
import { fetchSettings } from "@/api/settings";
import { fetchGoals } from "@/api/goals";
import { fetchCategories } from "@/api/categories";
import { fetchAccounts } from "@/api/accounts";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { createTransaction } from "@/api/transactions";
import { useInvalidateTransactionRelated } from "@/hooks/useInvalidateTransactionRelated";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { insightSeverityStyle } from "@/utils/colors";
import { formatDate, formatKrw, formatPercent, formatWeekRange, formatYearMonth } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { DashboardPeriod } from "@/types";
import { Flame, Target } from "lucide-react";

const PERIOD_TABS: DashboardPeriod[] = ["today", "week", "month"];
const PERIOD_LABEL: Record<DashboardPeriod, string> = { today: "오늘", week: "이번주", month: "이번달" };

const INSIGHT_LINKS: Partial<Record<string, { to: string; label: string }>> = {
  savings_rate: { to: "/transactions", label: "가계부 보기" },
  fixed_cost_ratio: { to: "/transactions", label: "가계부 보기" },
  variable_spend_trend: { to: "/transactions", label: "가계부 보기" },
  discretionary_ratio: { to: "/transactions", label: "가계부 보기" },
  debt_ratio: { to: "/transactions", label: "가계부 보기" },
  budget_overrun: { to: "/financial-plan?tab=현금흐름 계획", label: "예산 보기" },
  goal_pace: { to: "/financial-plan?tab=재무목표", label: "목표 보기" },
  emergency_fund: { to: "/financial-plan?tab=재무목표", label: "목표 보기" },
  savings_execution: { to: "/accounts?tab=저축·투자", label: "저축·투자 보기" },
};

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [day, setDay] = useState(currentDateIso());
  const [week, setWeek] = useState(currentWeekAnchor());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const invalidateAll = useInvalidateTransactionRelated();

  const anchor = period === "month" ? yearMonth : period === "week" ? week : day;

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.dashboard(period, anchor),
    queryFn: () => fetchDashboard(period, anchor),
    staleTime: STALE_TIME.SHORT,
  });
  const { data: settingsData } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: fetchSettings,
    staleTime: STALE_TIME.MEDIUM,
  });
  const { data: netWorth } = useQuery({ queryKey: QUERY_KEYS.netWorth, queryFn: () => fetchNetWorth() });
  const { data: goals } = useQuery({ queryKey: QUERY_KEYS.financialGoals, queryFn: fetchGoals });
  const { data: categories } = useQuery({
    queryKey: QUERY_KEYS.categories(),
    queryFn: () => fetchCategories(),
    staleTime: STALE_TIME.LONG,
    enabled: showQuickAdd,
  });
  const { data: accounts } = useQuery({
    queryKey: QUERY_KEYS.accounts,
    queryFn: fetchAccounts,
    staleTime: STALE_TIME.LONG,
    enabled: showQuickAdd,
  });
  const { data: savingsProducts } = useQuery({
    queryKey: QUERY_KEYS.savingsProducts,
    queryFn: fetchSavingsProducts,
    staleTime: STALE_TIME.MEDIUM,
    enabled: showQuickAdd,
  });

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      invalidateAll();
      setShowQuickAdd(false);
      toast("내역을 추가했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

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
  const totalUserSavings = data.by_user.reduce((sum, u) => sum + Math.max(0, Number(u.savings)), 0);
  const sparklineData = data.trend.map((row) => ({
    year_month: row.year_month,
    savings: Number(row.income) - Number(row.expense),
  }));
  const activeChallenge = data.active_challenge;
  const isCurrentPeriod = anchor === (period === "month" ? currentYearMonth() : currentDateIso());

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
        <div className="flex items-center gap-3 flex-wrap">
          {period === "today" && <DayPicker date={day} onChange={setDay} />}
          {period === "week" && <WeekPicker date={week} onChange={setWeek} />}
          {period === "month" && <MonthPicker yearMonth={yearMonth} onChange={setYearMonth} />}
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
      </div>

      {data.insights.length > 0 && (
        <div className="space-y-2">
          {data.insights.map((insight, i) => {
            const link = INSIGHT_LINKS[insight.rule_code];
            return (
              <div
                key={i}
                className={`border rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3 ${insightSeverityStyle(insight.severity)}`}
              >
                <span>{insight.message}</span>
                {link && (
                  <Link to={link.to} className="shrink-0 text-xs font-semibold underline hover:no-underline">
                    {link.label}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Link
          to="/financial-plan?tab=재무목표"
          className="card block hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors space-y-4"
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">우리 부부 목표</h3>
              {data.savings_streak_months > 0 && (
                <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                  <Flame size={12} aria-hidden="true" />
                  {data.savings_streak_months}개월 연속 목표 페이스
                </span>
              )}
            </div>
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
          </div>

          {sparklineData.some((row) => row.savings !== 0) && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">최근 {sparklineData.length}개월 저축 추이</p>
              <div className="h-12">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparklineData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <Tooltip
                      formatter={(value) => [formatKrw(Number(value)), "저축"]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="savings"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeChallenge && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium text-gray-700 dark:text-gray-300">진행중 챌린지 · {activeChallenge.title}</span>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                  {formatPercent(Number(activeChallenge.progress_pct))}
                </span>
              </div>
              <ProgressBar pct={Number(activeChallenge.progress_pct)} barClassName="bg-blue-500" />
            </div>
          )}

          {data.by_user.length > 0 && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {isCurrentPeriod
                    ? "이번 기간 함께 모은 돈"
                    : period === "month"
                      ? `${formatYearMonth(data.current_ym)} 함께 모은 돈`
                      : period === "week"
                        ? `${formatWeekRange(data.start, data.end)} 함께 모은 돈`
                        : `${formatDate(data.start)} 함께 모은 돈`}
                </span>
                <span className="font-bold text-gray-900 dark:text-gray-50">{formatKrw(totalUserSavings)}</span>
              </div>
              <div className="space-y-3">
                {data.by_user.map((u) => (
                  <div key={u.user_id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-gray-900 dark:text-gray-50">{u.display_name}</span>
                      <span className="text-gray-500 dark:text-gray-400">{formatKrw(u.savings)} 보탰어요</span>
                    </div>
                    <ProgressBar
                      pct={totalUserSavings > 0 ? (Math.max(0, Number(u.savings)) / totalUserSavings) * 100 : 0}
                    />
                  </div>
                ))}
              </div>
            </div>
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

      <SummaryCards totals={data.totals} collapsible />

      <MonthlyRetrospectiveCard />

      <QuickAddFab onClick={() => setShowQuickAdd(true)} />

      {showQuickAdd && (
        <Modal onClose={() => setShowQuickAdd(false)} title="내역 추가">
          <div className="p-6 overflow-y-auto">
            {!categories || !accounts || !savingsProducts ? (
              <SkeletonCard rows={4} />
            ) : (
              <TransactionForm
                categories={categories}
                accounts={accounts}
                savingsProducts={savingsProducts}
                layout="stack"
                isNew
                submitLabel="추가"
                submitting={createMutation.isPending}
                initialValues={{ transaction_date: currentDateIso() }}
                onSubmit={(payload) => createMutation.mutate(payload)}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
