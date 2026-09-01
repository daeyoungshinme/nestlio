import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import Tabs from "@/components/common/Tabs";
import MonthPicker from "@/components/common/MonthPicker";
import DayPicker from "@/components/common/DayPicker";
import { currentDateIso, currentYearMonth } from "@/utils/date";
import WeekPicker, { currentWeekAnchor } from "@/components/common/WeekPicker";
import MonthlyRetrospectiveCard from "@/components/dashboard/MonthlyRetrospectiveCard";
import TodayScheduleCard from "@/components/dashboard/TodayScheduleCard";
import CoupleContributionCard from "@/components/dashboard/CoupleContributionCard";
import SpendingFocusCard from "@/components/dashboard/SpendingFocusCard";
import InvestSurplusCard from "@/components/dashboard/InvestSurplusCard";
import GoalProgressCard from "@/components/financialPlan/GoalProgressCard";
import type { GoalProgressCardBadge } from "@/components/financialPlan/GoalProgressCard";
import SummaryCards, { type PlanCardSummary, type PlanSummaryLabel } from "@/components/common/SummaryCards";
import SkeletonCard from "@/components/common/SkeletonCard";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/common/Modal";
import QuickAddFab from "@/components/common/QuickAddFab";
import TransactionForm from "@/components/transactions/TransactionForm";
import { fetchDashboard } from "@/api/dashboard";
import { fetchCashflowPlan } from "@/api/cashflowPlan";
import { fetchNetWorth } from "@/api/netWorth";
import { fetchSettings } from "@/api/settings";
import { fetchGoals } from "@/api/goals";
import { createTransaction } from "@/api/transactions";
import { useAuthStore } from "@/stores/authStore";
import { useInvalidateTransactionRelated } from "@/hooks/useInvalidateTransactionRelated";
import { useAccounts, useCategories, useSavingsProducts, useUsers } from "@/hooks/useReferenceData";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { insightSeverityStyle, progressStatusBadgeClass, progressStatusLabel, worseStatus } from "@/utils/colors";
import { computeCardStatus, daysUntil } from "@/utils/goalStatus";
import { formatDate, formatKrw, formatKrwCompact, formatWeekRange, formatYearMonth, pctOf } from "@/utils/format";
import { splitSavingsAndRealEstate } from "@/utils/netWorth";
import { estimateGoalAcceleration } from "@/utils/monthRange";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import { findGrowlioInvestmentLink } from "@/constants/growlio";
import type { DashboardPeriod, SavingsProductOut } from "@/types";
import { ChevronDown, ChevronRight, Flame, Target } from "lucide-react";

const PERIOD_TABS: DashboardPeriod[] = ["today", "week", "month"];
const PERIOD_LABEL: Record<DashboardPeriod, string> = { today: "오늘", week: "이번주", month: "이번달" };

const INSIGHT_LINKS: Partial<Record<string, { to: string; label: string }>> = {
  savings_rate: { to: "/transactions", label: "가계부 보기" },
  fixed_cost_ratio: { to: "/transactions", label: "가계부 보기" },
  variable_spend_trend: { to: "/transactions", label: "가계부 보기" },
  discretionary_ratio: { to: "/transactions", label: "가계부 보기" },
  debt_ratio: { to: "/transactions", label: "가계부 보기" },
  category_benchmark: { to: "/reports/yearly", label: "연간 리포트 보기" },
  budget_overrun: { to: "/financial-plan?view=이번 달", label: "이번 달 계획 보기" },
  emergency_fund: { to: "/accounts?section=저축·투자", label: "저축·투자 보기" },
  savings_execution: { to: "/accounts?section=저축·투자", label: "저축·투자 보기" },
};

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [day, setDay] = useState(currentDateIso());
  const [week, setWeek] = useState(currentWeekAnchor());
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddPrefill, setQuickAddPrefill] = useState<Record<string, string> | null>(null);
  const [showMore, setShowMore] = useState(false);
  const invalidateAll = useInvalidateTransactionRelated();

  const anchor = period === "month" ? yearMonth : period === "week" ? week : day;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEYS.dashboard(period, anchor),
    queryFn: () => fetchDashboard(period, anchor),
    staleTime: STALE_TIME.SHORT,
  });
  // goal_pace 코칭 문구를 보여주는 화면은 대시보드뿐이다(GoalsTab 배너는 중복이라 제거함).
  // 문구는 항상 "이번 달 페이스" 기준이어야 하므로, 사용자가 고른 period/anchor와 무관하게
  // 당월 고정 쿼리로 따로 가져온다 — GoalsTab이 investable_surplus 조회에 쓰는 쿼리와
  // 쿼리 키가 같아 자연히 캐시를 공유한다.
  const { data: monthDashboard } = useQuery({
    queryKey: QUERY_KEYS.dashboard("month", currentYearMonth()),
    queryFn: () => fetchDashboard("month", currentYearMonth()),
    staleTime: STALE_TIME.SHORT,
  });
  // SummaryCards에 "계획 대비 %"를 보여주기 위한 계획 데이터. day/week 기간에는 월 단위 계획과
  // 비교하는 게 의미가 없으므로 period === "month"일 때만 가져온다. CashflowPlanTab과 같은
  // 쿼리 키를 써서 두 탭을 오가도 캐시를 재사용한다.
  const { data: planData } = useQuery({
    queryKey: QUERY_KEYS.cashflowPlan(yearMonth),
    queryFn: () => fetchCashflowPlan(yearMonth),
    staleTime: STALE_TIME.SHORT,
    enabled: period === "month",
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
  const { data: goals } = useQuery({
    queryKey: QUERY_KEYS.financialGoals,
    queryFn: fetchGoals,
    staleTime: STALE_TIME.MEDIUM,
  });
  const { data: categories } = useCategories(undefined, { enabled: showQuickAdd });
  const { data: accounts } = useAccounts({ enabled: showQuickAdd });
  const { data: savingsProducts } = useSavingsProducts();
  // 자산현황(/accounts) 순자산 카드와 동일한 구성으로 보이도록 부동산을 저축·투자에서 분리한다.
  const { savingsInvestmentTotal, realEstateTotal } = netWorth
    ? splitSavingsAndRealEstate(Number(netWorth.current.savings_total), savingsProducts)
    : { savingsInvestmentTotal: 0, realEstateTotal: 0 };
  const { data: users } = useUsers();
  const currentUserId = useAuthStore((s) => s.userId);

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      invalidateAll();
      setShowQuickAdd(false);
      setQuickAddPrefill(null);
      toast("내역을 추가했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const closeQuickAdd = () => {
    setShowQuickAdd(false);
    setQuickAddPrefill(null);
  };

  // 여유자금 카드에서 "저축 기록" — 빠른 추가 모달을 그 상품·금액으로 미리 채워 연다. 저축 카테고리
  // 선택만 사용자가 확인하면 되고, growlio 연동 상품이면 저장 시 growlio 입금에도 반영된다.
  const recordInvestment = (product: SavingsProductOut, amount: string) => {
    setQuickAddPrefill({
      transaction_date: currentDateIso(),
      type: "expense",
      amount,
      savings_product_id: String(product.id),
    });
    setShowQuickAdd(true);
  };

  if (isError) {
    return (
      <ErrorState
        message={extractErrorMessage(error, "대시보드 정보를 불러오지 못했습니다.")}
        onRetry={() => void refetch()}
      />
    );
  }

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
    // 연속 목표 페이스 유지 개월 수 — 카드 아래 보조문구가 아니라 배지로 승격해 목표 탭에
    // 들어가지 않아도 눈에 바로 띄도록 한다.
    if (data.savings_streak_months > 0) {
      topGoalBadges.push({
        label: `${data.savings_streak_months}개월 연속`,
        toneClassName: "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
        icon: <Flame size={11} aria-hidden="true" />,
      });
    }
  }
  const goalPaceInsight = monthDashboard?.insights.find((i) => i.rule_code === "goal_pace");
  // growlio 연동 목표에 이번 달 여유자금을 보태면 얼마나 앞당겨지는지 — GoalsTab의 여유자금
  // 힌트와 같은 계산(estimateGoalAcceleration), 백엔드 변경 없이 프론트에서 추정한다. 힌트를 붙일
  // 목표는 카드 제목(topGoal, 순수 1순위)과 달리 GoalsTab의 firstGrowlioLinkedGoalId와 동일하게
  // "growlio 연동된 목표 중 1순위"를 찾는다 — 1순위 목표가 미연동이면 두 화면이 서로 다른 목표에
  // 힌트를 붙이던 불일치를 없애기 위함(연동 안 된 목표는 애초에 투자로 앞당길 방법이 없어 힌트를
  // 못 붙이므로).
  const accelerationGoal = goals?.length
    ? goals
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .find((g) => findGrowlioInvestmentLink(g, savingsProducts ?? []))
    : undefined;
  const topGoalGrowlioLink = accelerationGoal ? findGrowlioInvestmentLink(accelerationGoal, savingsProducts ?? []) : null;
  const topGoalAcceleration = accelerationGoal
    ? estimateGoalAcceleration(
        accelerationGoal.required_amount,
        accelerationGoal.current_amount,
        accelerationGoal.months_remaining,
        accelerationGoal.suggested_monthly_amount,
        data.investable_surplus,
      )
    : null;
  const totalOwnerSavings = Number(data.totals.savings);
  const sparklineData = data.trend.map((row) => ({
    year_month: row.year_month,
    savings: Number(row.income) - Number(row.expense),
  }));
  // goal_pace 인사이트는 아래 "우리 부부 목표" 카드(extraDetails)에서 이미 보여주므로, 같은 문구가
  // 상단 인사이트 스트립에 중복 노출되지 않도록 걸러낸다 — 카드가 이미 그 목표 맥락 안에 있어 더 적절하다.
  const visibleInsights = data.insights.filter((i) => i.rule_code !== "goal_pace");
  const isCurrentPeriod = anchor === (period === "month" ? currentYearMonth() : currentDateIso());

  // SummaryCards의 "계획 대비 %" — 수입/고정/변동/비정기는 백엔드가 이미 계산한 pct/status를
  // 그대로 쓴다. 지출(합계)/저축은 서버에 대응하는 섹션이 없는 파생값이라 프론트에서 직접
  // pctOf/worseStatus(둘 다 기존 유틸)로 계산한다.
  const planSummary: Record<PlanSummaryLabel, PlanCardSummary> | undefined =
    period === "month" && planData
      ? {
          income: { pct: planData.summary.income.pct, status: planData.summary.income.status },
          fixed: { pct: planData.summary.fixed.pct, status: planData.summary.fixed.status },
          variable: { pct: planData.summary.variable.pct, status: planData.summary.variable.status },
          irregular: { pct: planData.summary.irregular.pct, status: planData.summary.irregular.status },
          expense: {
            pct: pctOf(Number(data.totals.expense), Number(planData.summary.expense_total)),
            status: worseStatus(
              planData.summary.fixed.status,
              worseStatus(planData.summary.variable.status, planData.summary.irregular.status),
            ),
          },
          savings: {
            pct: pctOf(Number(data.totals.savings), Number(planData.summary.available)),
            status: null,
          },
        }
      : undefined;

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
          <p className="text-xs text-gray-400 dark:text-gray-500">코칭 알림</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {!topGoal ? (
          <Link to="/financial-plan?view=목표" className="relative card block hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
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
          <Link to="/financial-plan?view=목표" className="relative block">
            <ChevronRight size={16} className="absolute top-5 right-5 text-gray-300 dark:text-gray-600 z-10" aria-hidden="true" />
            <GoalProgressCard
              className="hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
              metaLine="우리 부부 목표"
              title={topGoal.name}
              badges={topGoalBadges}
              pct={Number(topGoal.progress_pct)}
              primaryDetail={`${formatKrw(topGoal.current_amount)} / ${formatKrw(topGoal.required_amount)}`}
              extraDetails={[
                ...(goalPaceInsight ? [{ key: "pace", content: goalPaceInsight.message }] : []),
                ...(topGoalAcceleration && accelerationGoal
                  ? [
                      {
                        key: "acceleration",
                        content:
                          accelerationGoal.id === topGoal.id
                            ? `이번 달 여유자금을 이 목표에 보태면 달성까지 ${accelerationGoal.months_remaining}개월 → ${topGoalAcceleration.newMonthsRemaining}개월로 ${topGoalAcceleration.monthsSaved}개월 앞당길 수 있어요`
                            : `이번 달 여유자금을 growlio 연동된 "${accelerationGoal.name}" 목표에 보태면 달성까지 ${accelerationGoal.months_remaining}개월 → ${topGoalAcceleration.newMonthsRemaining}개월로 ${topGoalAcceleration.monthsSaved}개월 앞당길 수 있어요`,
                      },
                    ]
                  : []),
              ]}
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
            </>
          )}
        </Link>
      </div>

      <SummaryCards totals={data.totals} collapsible planSummary={planSummary} />

      <TodayScheduleCard day={currentDateIso()} users={users} />

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
        ownerTotals={data.owner_totals}
        totalOwnerSavings={totalOwnerSavings}
      />

      <SpendingFocusCard
        ownerOverspendHighlights={data.owner_overspend_highlights}
        categoryBenchmarks={data.category_benchmarks}
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
            onRecordInvestment={recordInvestment}
            topGoalGrowlioAccountId={topGoalGrowlioLink}
            topGoalAcceleration={topGoalAcceleration}
          />

          <MonthlyRetrospectiveCard />
        </div>
      )}

      <QuickAddFab onClick={() => setShowQuickAdd(true)} />

      {showQuickAdd && (
        <Modal onClose={closeQuickAdd} title={quickAddPrefill ? "여유자금 저축 기록" : "내역 추가"}>
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
                initialValues={quickAddPrefill ?? { transaction_date: currentDateIso() }}
                onSubmit={(payload) => createMutation.mutate(payload)}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
