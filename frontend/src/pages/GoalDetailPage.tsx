import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Target } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import CombinedMembersCard from "@/components/financialPlan/goalDetail/CombinedMembersCard";
import GoalCheerCard from "@/components/financialPlan/goalDetail/GoalCheerCard";
import GoalFundingSourcesCard from "@/components/financialPlan/goalDetail/GoalFundingSourcesCard";
import GoalMonthlyHistoryCard from "@/components/financialPlan/goalDetail/GoalMonthlyHistoryCard";
import GoalScenarioCard from "@/components/financialPlan/goalDetail/GoalScenarioCard";
import GoalSummaryCard from "@/components/financialPlan/goalDetail/GoalSummaryCard";
import GrowlioInsightCard from "@/components/financialPlan/goalDetail/GrowlioInsightCard";
import { GROWLIO_APP_URL } from "@/constants/growlio";
import { ROUTES } from "@/constants/routes";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { useGoals } from "@/hooks/useReferenceData";
import type { FinancialGoalOut } from "@/types";

export default function GoalDetailPage() {
  const { id } = useParams();
  const goalId = Number(id);
  const goalsQuery = useGoals();

  return (
    <QueryBoundary query={goalsQuery} loadingFallback={<SkeletonCard rows={6} />} errorMessage="목표를 불러오지 못했습니다.">
      {(goals) => {
        const goal = goals.find((g) => g.id === goalId);
        if (!goal) {
          return (
            <div className="card">
              <EmptyState icon={Target} title="목표를 찾을 수 없어요" description="삭제됐거나 잘못된 주소예요." compact />
              <div className="flex justify-center">
                <Link to={ROUTES.goals} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                  목표 목록으로
                </Link>
              </div>
            </div>
          );
        }
        return <GoalDetail goal={goal} />;
      }}
    </QueryBoundary>
  );
}

/** 목표 하나의 상세 — 목표 카드에 다 담기 어려웠던 "어떻게 하면 더 빨리?"와 "서로 응원"을 모았다:
 * 진행 요약, 월 추가 저축 시나리오, growlio 수익 인사이트, 응원 보내기와 이 목표의 축하·응원 기록, 통합 목표 구성,
 * 월별 달성 기록, 연동 자금원. 카드는 `components/financialPlan/goalDetail/`. */
function GoalDetail({ goal }: { goal: FinancialGoalOut }) {
  const isChallenge = goal.kind === "challenge";
  return (
    <div className="space-y-4">
      <Link
        to={ROUTES.goals}
        className={`inline-flex items-center gap-1 ${TOUCH_TARGET_MIN_HEIGHT} text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200`}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        목표 목록
      </Link>
      <GoalSummaryCard goal={goal} />
      {!isChallenge && <GoalScenarioCard goal={goal} />}
      {!isChallenge && GROWLIO_APP_URL && <GrowlioInsightCard goalId={goal.id} />}
      <GoalCheerCard goalId={goal.id} />
      {goal.kind === "combined" && <CombinedMembersCard goal={goal} />}
      {goal.monthly_targets.length > 0 && <GoalMonthlyHistoryCard monthlyTargets={goal.monthly_targets} />}
      {goal.funding_sources.length > 0 && <GoalFundingSourcesCard goal={goal} />}
    </div>
  );
}
