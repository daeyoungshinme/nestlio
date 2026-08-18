import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import Tabs from "@/components/common/Tabs";
import MonthPicker, { currentYearMonth } from "@/components/common/MonthPicker";
import DayPicker, { currentDateIso } from "@/components/common/DayPicker";
import WeekPicker, { currentWeekAnchor } from "@/components/common/WeekPicker";
import MonthlyRetrospectiveCard from "@/components/dashboard/MonthlyRetrospectiveCard";
import CoupleContributionCard from "@/components/dashboard/CoupleContributionCard";
import InvestSurplusCard from "@/components/dashboard/InvestSurplusCard";
import GoalProgressCard from "@/components/financialPlan/GoalProgressCard";
import type { GoalProgressCardBadge } from "@/components/financialPlan/GoalProgressCard";
import SummaryCards from "@/components/common/SummaryCards";
import SkeletonCard from "@/components/common/SkeletonCard";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/common/Modal";
import QuickAddFab from "@/components/common/QuickAddFab";
import TransactionForm from "@/components/transactions/TransactionForm";
import { fetchDashboard } from "@/api/dashboard";
import { fetchGrowlioUnlinkedNetWorth, fetchNetWorth } from "@/api/netWorth";
import { fetchSettings } from "@/api/settings";
import { fetchGoals } from "@/api/goals";
import { fetchCategories } from "@/api/categories";
import { fetchAccounts } from "@/api/accounts";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { fetchUsers } from "@/api/users";
import { createTransaction } from "@/api/transactions";
import { useAuthStore } from "@/stores/authStore";
import { useInvalidateTransactionRelated } from "@/hooks/useInvalidateTransactionRelated";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { insightSeverityStyle, progressStatusBadgeClass, progressStatusLabel } from "@/utils/colors";
import { computeCardStatus, daysUntil } from "@/utils/goalStatus";
import { formatDate, formatKrw, formatKrwCompact, formatWeekRange, formatYearMonth } from "@/utils/format";
import { splitSavingsAndRealEstate } from "@/utils/netWorth";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { DashboardPeriod } from "@/types";
import { ChevronDown, ChevronRight, Flame, Target } from "lucide-react";

const PERIOD_TABS: DashboardPeriod[] = ["today", "week", "month"];
const PERIOD_LABEL: Record<DashboardPeriod, string> = { today: "오늘", week: "이번주", month: "이번달" };

const INSIGHT_LINKS: Partial<Record<string, { to: string; label: string }>> = {
  savings_rate: { to: "/transactions", label: "가계부 보기" },
  fixed_cost_ratio: { to: "/transactions", label: "가계부 보기" },
  variable_spend_trend: { to: "/transactions", label: "가계부 보기" },
  discretionary_ratio: { to: "/transactions", label: "가계부 보기" },
  debt_ratio: { to: "/transactions", label: "가계부 보기" },
  budget_overrun: { to: "/financial-plan?tab=현금흐름 계획", label: "예산 보기" },
  emergency_fund: { to: "/accounts?tab=저축·투자", label: "저축·투자 보기" },
  savings_execution: { to: "/accounts?tab=저축·투자", label: "저축·투자 보기" },
};

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [day, setDay] = useState(currentDateIso());
  const [week, setWeek] = useState(currentWeekAnchor());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const invalidateAll = useInvalidateTransactionRelated();

  const anchor = period === "month" ? yearMonth : period === "week" ? week : day;

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.dashboard(period, anchor),
    queryFn: () => fetchDashboard(period, anchor),
    staleTime: STALE_TIME.SHORT,
  });
  // goal_pace 코칭 문구는 항상 "이번 달 페이스" 기준이어야 하므로, 사용자가 고른 period/anchor와
  // 무관하게 GoalsTab과 동일한 쿼리 키(당월 고정)로 따로 가져온다 — 두 화면이 항상
  // 같은 문구를 보여주도록 캐시를 공유시킨다.
  const { data: monthDashboard } = useQuery({
    queryKey: QUERY_KEYS.dashboard("month", currentYearMonth()),
    queryFn: () => fetchDashboard("month", currentYearMonth()),
    staleTime: STALE_TIME.SHORT,
  });
  const { data: settingsData } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: fetchSettings,
    staleTime: STALE_TIME.MEDIUM,
  });
  const { data: netWorth } = useQuery({
    queryKey: QUERY_KEYS.netWorth,
    queryFn: () => fetchNetWorth(),
    staleTime: STALE_TIME.MEDIUM,
  });
  const { data: growlioUnlinked } = useQuery({
    queryKey: QUERY_KEYS.netWorthGrowlioUnlinked,
    queryFn: fetchGrowlioUnlinkedNetWorth,
    staleTime: STALE_TIME.MEDIUM,
    retry: false,
  });
  const { data: goals } = useQuery({
    queryKey: QUERY_KEYS.financialGoals,
    queryFn: fetchGoals,
    staleTime: STALE_TIME.MEDIUM,
  });
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
  });
  // 자산현황(/accounts) 순자산 카드와 동일한 구성으로 보이도록 부동산을 저축·투자에서 분리한다.
  const { savingsInvestmentTotal, realEstateTotal } = netWorth
    ? splitSavingsAndRealEstate(Number(netWorth.current.savings_total), savingsProducts)
    : { savingsInvestmentTotal: 0, realEstateTotal: 0 };
  const { data: users } = useQuery({
    queryKey: QUERY_KEYS.users,
    queryFn: fetchUsers,
    staleTime: STALE_TIME.LONG,
    enabled: showQuickAdd,
  });
  const currentUserId = useAuthStore((s) => s.userId);

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
  const topGoalBadges: GoalProgressCardBadge[] = [];
  if (topGoal) {
    if (topGoal.target_date !== null) {
      topGoalBadges.push({
        label: `D-${daysUntil(topGoal.target_date)}`,
        toneClassName: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
      });
    }
    const goalStatus = computeCardStatus(topGoal);
    topGoalBadges.push({ label: progressStatusLabel(goalStatus), toneClassName: progressStatusBadgeClass(goalStatus) });
  }
  const streakSubtitle =
    topGoal && data.savings_streak_months > 0 ? (
      <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-0.5">
        <Flame size={12} aria-hidden="true" />
        함께 {data.savings_streak_months}개월째 목표 페이스를 지키고 있어요
      </p>
    ) : null;
  const goalPaceInsight = monthDashboard?.insights.find((i) => i.rule_code === "goal_pace");
  const totalUserSavings = data.by_user.reduce((sum, u) => sum + Math.max(0, Number(u.savings)), 0);
  const sparklineData = data.trend.map((row) => ({
    year_month: row.year_month,
    savings: Number(row.income) - Number(row.expense),
  }));
  // goal_pace 인사이트는 아래 "우리 부부 목표" 카드(extraDetails)에서 이미 보여주므로, 같은 문구가
  // 상단 인사이트 스트립에 중복 노출되지 않도록 걸러낸다 — 카드가 이미 그 목표 맥락 안에 있어 더 적절하다.
  const visibleInsights = data.insights.filter((i) => i.rule_code !== "goal_pace");
  const isCurrentPeriod = anchor === (period === "month" ? currentYearMonth() : currentDateIso());

  return (
    <div className="space-y-6">
      {settingsData?.couple_photo_url && (
        <div className="rounded-xl overflow-hidden h-24 sm:h-32 lg:h-56">
          <img
            src={settingsData.couple_photo_url}
            alt="부부 사진"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto overflow-x-auto scrollbar-none">
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

      {visibleInsights.length > 0 && (
        <div className="space-y-2">
          {visibleInsights.map((insight, i) => {
            const link = INSIGHT_LINKS[insight.rule_code];
            return (
              <div
                key={i}
                className={`border rounded-lg px-4 py-3 text-sm flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ${insightSeverityStyle(insight.severity)}`}
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

      <SummaryCards totals={data.totals} collapsible />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {!topGoal ? (
          <Link to="/financial-plan?tab=재무목표" className="relative card block hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
            <ChevronRight size={16} className="absolute top-5 right-5 text-gray-300 dark:text-gray-600" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">우리 부부 목표</h3>
            <EmptyState
              icon={Target}
              title="아직 목표가 없어요"
              description="목표 탭에서 첫 재무목표를 세워보세요"
              compact
            />
          </Link>
        ) : (
          <Link to="/financial-plan?tab=재무목표" className="relative block">
            <ChevronRight size={16} className="absolute top-5 right-5 text-gray-300 dark:text-gray-600 z-10" aria-hidden="true" />
            <GoalProgressCard
              className="hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
              metaLine="우리 부부 목표"
              title={topGoal.name}
              badges={topGoalBadges}
              subtitle={streakSubtitle}
              pct={Number(topGoal.progress_pct)}
              primaryDetail={`${formatKrw(topGoal.current_amount)} / ${formatKrw(topGoal.required_amount)}`}
              extraDetails={goalPaceInsight ? [{ key: "pace", content: goalPaceInsight.message }] : []}
              footer={
                <>
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
                </>
              }
            />
          </Link>
        )}

        <Link to="/accounts" className="relative card block hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
          <ChevronRight size={16} className="absolute top-4 right-4 text-gray-300 dark:text-gray-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">순자산</h3>
          {!netWorth ? (
            <SkeletonCard rows={2} />
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1 truncate" title={formatKrw(netWorth.current.net_worth)}>
                {formatKrwCompact(Number(netWorth.current.net_worth))}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 truncate">
                {formatKrw(netWorth.current.net_worth)}
              </p>
              <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex justify-between gap-2">
                  <span className="shrink-0">계좌</span>
                  <span className="truncate" title={formatKrw(netWorth.current.accounts_total)}>
                    {formatKrwCompact(Number(netWorth.current.accounts_total))}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="shrink-0">저축·투자</span>
                  <span className="truncate" title={formatKrw(savingsInvestmentTotal)}>
                    {formatKrwCompact(savingsInvestmentTotal)}
                  </span>
                </div>
                {realEstateTotal > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="shrink-0">부동산</span>
                    <span className="truncate" title={formatKrw(realEstateTotal)}>
                      {formatKrwCompact(realEstateTotal)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="shrink-0">대출</span>
                  <span className="truncate" title={`-${formatKrw(netWorth.current.loans_total)}`}>
                    -{formatKrwCompact(Number(netWorth.current.loans_total))}
                  </span>
                </div>
              </div>
              {growlioUnlinked && growlioUnlinked.item_count > 0 && (
                <p className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-emerald-600 dark:text-emerald-400">
                  growlio 미연동 자산 +{formatKrw(growlioUnlinked.net_total)} ({growlioUnlinked.item_count}건)
                </p>
              )}
            </>
          )}
        </Link>
      </div>

      <CoupleContributionCard
        title={
          isCurrentPeriod
            ? "이번 기간 함께 모은 돈"
            : period === "month"
              ? `${formatYearMonth(data.current_ym)} 함께 모은 돈`
              : period === "week"
                ? `${formatWeekRange(data.start, data.end)} 함께 모은 돈`
                : `${formatDate(data.start)} 함께 모은 돈`
        }
        byUser={data.by_user}
        totalUserSavings={totalUserSavings}
      />

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        className="w-full flex items-center justify-center gap-1.5 min-h-[44px] text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        {showMore ? "간단히 보기" : "더 보기"}
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform duration-200 ${showMore ? "rotate-180" : ""}`}
        />
      </button>

      {showMore && (
        <div className="space-y-6">
          <InvestSurplusCard
            surplusAllocation={data.surplus_allocation}
            investmentProducts={savingsProducts ?? []}
          />

          <MonthlyRetrospectiveCard />
        </div>
      )}

      <QuickAddFab onClick={() => setShowQuickAdd(true)} />

      {showQuickAdd && (
        <Modal onClose={() => setShowQuickAdd(false)} title="내역 추가">
          <div className="p-6 overflow-y-auto">
            {!categories || !accounts || !savingsProducts || !users ? (
              <SkeletonCard rows={4} />
            ) : (
              <TransactionForm
                categories={categories}
                accounts={accounts}
                savingsProducts={savingsProducts}
                users={users}
                currentUserId={currentUserId ?? undefined}
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
