import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import CoachingInsights from "@/components/home/CoachingInsights";
import HomeGoalHero from "@/components/home/HomeGoalHero";
import MonthPlanProgressCard from "@/components/home/MonthPlanProgressCard";
import MonthlyRetrospectiveCard from "@/components/dashboard/MonthlyRetrospectiveCard";
import TodayScheduleCard from "@/components/dashboard/TodayScheduleCard";
import CoupleContributionCard from "@/components/dashboard/CoupleContributionCard";
import SpendingFocusCard from "@/components/dashboard/SpendingFocusCard";
import InvestSurplusCard from "@/components/dashboard/InvestSurplusCard";
import SkeletonCard from "@/components/common/SkeletonCard";
import ErrorState from "@/components/common/ErrorState";
import QueryBoundary from "@/components/common/QueryBoundary";
import Modal from "@/components/common/Modal";
import QuickAddFab from "@/components/common/QuickAddFab";
import TransactionForm from "@/components/transactions/TransactionForm";
import { fetchDashboard } from "@/api/dashboard";
import { fetchCashflowPlan } from "@/api/cashflowPlan";
import { fetchSavingsProductsPlan } from "@/api/savingsProducts";
import { useAuthStore } from "@/stores/authStore";
import { useCreateTransaction } from "@/hooks/useInvalidateTransactionRelated";
import { useNotifications } from "@/hooks/useNotifications";
import { useAccounts, useCategories, useDashboardBootstrap, useMe } from "@/hooks/useReferenceData";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { currentDateIso, currentYearMonth } from "@/utils/date";
import { estimateGoalAcceleration } from "@/utils/goalAcceleration";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import { findGrowlioInvestmentLink } from "@/constants/growlio";
import type { NotificationListOut, NotificationReactionOut, SavingsProductOut } from "@/types";

/** 월초 며칠 동안은 지난달 회고를 맨 위에 올린다 — 그 외엔 새 달의 진행이 더 중요하다. */
const RETROSPECTIVE_DAYS = 7;
const CHEER_NOTIF_TYPES = new Set(["goal_milestone", "challenge_success"]);

/** 배우자가 목표 마일스톤 알림에 남긴 가장 최근 응원. 알림 인박스(헤더)와 같은 쿼리 키라 캐시를 공유한다. */
function latestPartnerCheer(
  notifications: NotificationListOut | undefined,
  myUserId: string | undefined,
): NotificationReactionOut | null {
  if (!notifications || !myUserId) return null;
  const cheers = notifications.items
    .filter((n) => CHEER_NOTIF_TYPES.has(n.notif_type))
    .flatMap((n) => n.reactions)
    .filter((r) => r.user_id !== myUserId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return cheers[0] ?? null;
}

/** 홈 — "오늘 우리 목표는 어디쯤?"을 한 화면에 답한다. 위에서부터
 *   ① 목표 히어로(대표 목표·연속 달성·배우자 응원·순자산 칩) + 여유자금 저축 제안
 *   ② 이번 달 계획 대비 진행(5개 축 미니 막대 → 계획 탭)
 *   ③ 코칭 상위 2개  ④ 지출 줄이기  ⑤ 오늘 일정·다가오는 고정 수입/지출  ⑥ 부부 기여(월초엔 지난달 회고)
 * 구 대시보드의 오늘/이번주/이번달 기간 탭은 없앴다(홈은 늘 이번 달 — 날짜별 내역은 가계부가 담당). 순자산 상세
 * 카드·결제수단 카드·수입/지출 요약카드는 각각 자산 탭·가계부·계획 탭과 겹쳐 뺐다. */
export default function DashboardPage() {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddPrefill, setQuickAddPrefill] = useState<Record<string, string> | null>(null);
  const yearMonth = currentYearMonth();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.dashboard(yearMonth),
    queryFn: () => fetchDashboard(yearMonth),
    staleTime: STALE_TIME.SHORT,
  });
  // 계획 탭과 같은 쿼리 키 — 두 탭을 오가도 캐시를 재사용한다.
  const { data: planData } = useQuery({
    queryKey: QUERY_KEYS.cashflowPlan(yearMonth),
    queryFn: () => fetchCashflowPlan(yearMonth),
    staleTime: STALE_TIME.SHORT,
  });
  const { data: savingsPlanData } = useQuery({
    queryKey: QUERY_KEYS.savingsProductsPlan(yearMonth),
    queryFn: () => fetchSavingsProductsPlan(yearMonth),
    staleTime: STALE_TIME.SHORT,
  });
  const { data: notifications } = useNotifications();
  const { data: me } = useMe();
  // settings/net-worth/financial-goals/savings-products/users를 한 요청으로 묶어서 가져온다.
  const bootstrap = useDashboardBootstrap();
  const goals = bootstrap.data?.goals;
  const savingsProducts = bootstrap.data?.savings_products;
  const users = bootstrap.data?.users;
  const netWorth = bootstrap.data?.net_worth;
  // 빠른 추가 모달의 입력 양식을 채우는 참조 데이터.
  const categoriesQuery = useCategories(undefined, { enabled: showQuickAdd });
  const accountsQuery = useAccounts({ enabled: showQuickAdd });
  const currentUserId = useAuthStore((s) => s.userId);

  const createMutation = useCreateTransaction(() => {
    setShowQuickAdd(false);
    setQuickAddPrefill(null);
    toast("내역을 추가했습니다.", "success");
  });

  const closeQuickAdd = () => {
    setShowQuickAdd(false);
    setQuickAddPrefill(null);
  };

  // 여유자금 카드에서 "저축 기록" — 빠른 추가 모달을 그 상품·금액으로 미리 채워 연다. growlio 연동 상품이면
  // 저장 시 growlio 입금에도 반영된다.
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
      <ErrorState message={extractErrorMessage(error, "홈 정보를 불러오지 못했습니다.")} onRetry={() => void refetch()} />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonCard rows={3} />
        <SkeletonCard rows={4} />
      </div>
    );
  }

  const goalsByPriority = (goals ?? []).slice().sort((a, b) => a.priority - b.priority);
  const topGoal = goalsByPriority[0] ?? null;
  // 여유자금으로 앞당길 수 있는 목표는 "growlio 연동된 목표 중 1순위" — 연동 안 된 목표는 투자로 앞당길 방법이 없다.
  const accelerationGoal = goalsByPriority.find((g) => findGrowlioInvestmentLink(g, savingsProducts ?? []));
  const accelerationLink = accelerationGoal ? findGrowlioInvestmentLink(accelerationGoal, savingsProducts ?? []) : null;
  const acceleration = accelerationGoal
    ? estimateGoalAcceleration(
        accelerationGoal.required_amount,
        accelerationGoal.current_amount,
        accelerationGoal.months_remaining,
        accelerationGoal.suggested_monthly_amount,
        data.investable_surplus,
      )
    : null;
  const paceMessage = data.insights.find((i) => i.rule_code === "goal_pace")?.message ?? null;
  const showRetrospective = new Date().getDate() <= RETROSPECTIVE_DAYS;

  return (
    <div className="space-y-4">
      {showRetrospective && <MonthlyRetrospectiveCard />}

      <HomeGoalHero
        goal={topGoal}
        streakMonths={data.savings_streak_months}
        paceMessage={paceMessage}
        netWorth={netWorth ? Number(netWorth.current.net_worth) : null}
        couplePhotoUrl={bootstrap.data?.settings.couple_photo_url ?? null}
        partnerCheer={latestPartnerCheer(notifications, me?.id)}
        savingsTrend={data.trend.map((row) => ({
          year_month: row.year_month,
          savings: Number(row.income) - Number(row.expense),
        }))}
      />

      <InvestSurplusCard
        surplusAllocation={data.surplus_allocation}
        investmentProducts={savingsProducts ?? []}
        onRecordInvestment={recordInvestment}
        topGoalGrowlioAccountId={accelerationLink}
        topGoalAcceleration={acceleration}
      />

      <MonthPlanProgressCard plan={planData} savingsPlan={savingsPlanData} />

      <CoachingInsights insights={data.insights} />

      <SpendingFocusCard
        ownerOverspendHighlights={data.owner_overspend_highlights}
        categoryBenchmarks={data.category_benchmarks}
      />

      <TodayScheduleCard day={currentDateIso()} users={users} />

      {!showRetrospective && (
        <CoupleContributionCard
          title="이번 달 함께 모은 돈"
          ownerTotals={data.owner_totals}
          totalOwnerSavings={Number(data.totals.savings)}
        />
      )}

      <QuickAddFab onClick={() => setShowQuickAdd(true)} />

      {showQuickAdd && (
        <Modal onClose={closeQuickAdd} title={quickAddPrefill ? "여유자금 저축 기록" : "내역 추가"}>
          <div className="p-6 overflow-y-auto">
            <QueryBoundary
              queries={[categoriesQuery, accountsQuery, bootstrap]}
              loadingFallback={<SkeletonCard rows={4} />}
              errorMessage="입력 양식을 불러오지 못했습니다."
            >
              <TransactionForm
                categories={categoriesQuery.data!}
                accounts={accountsQuery.data!}
                savingsProducts={bootstrap.data!.savings_products}
                users={bootstrap.data!.users}
                currentUserId={currentUserId ?? undefined}
                layout="stack"
                isNew
                submitLabel="추가"
                submitting={createMutation.isPending}
                initialValues={quickAddPrefill ?? { transaction_date: currentDateIso() }}
                onSubmit={(payload) => createMutation.mutate(payload)}
              />
            </QueryBoundary>
          </div>
        </Modal>
      )}
    </div>
  );
}
