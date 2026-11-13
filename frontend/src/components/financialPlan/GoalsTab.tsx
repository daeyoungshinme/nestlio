import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Target, Trophy } from "lucide-react";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import CollapsibleHint from "@/components/common/CollapsibleHint";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import QueryBoundary from "@/components/common/QueryBoundary";
import Tabs from "@/components/common/Tabs";
import GoalFormModal from "@/components/financialPlan/GoalFormModal";
import GoalListCard from "@/components/financialPlan/GoalListCard";
import GoalSectionHeader from "@/components/financialPlan/GoalSectionHeader";
import { EMPTY_GOAL_DRAFT, draftFromGoal, toPayload, type Draft } from "@/components/financialPlan/goalDraft";
import { createGoal, deleteGoal, refreshGrowlioGoalSnapshot, updateGoal } from "@/api/goals";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { planViewLink } from "@/constants/routes";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { useAccounts, useGoals, useLoans, useMe, useSavingsProducts, useUsers } from "@/hooks/useReferenceData";
import { celebrateIfCrossed } from "@/utils/goalMilestone";
import { isGoalAchieved } from "@/utils/goalStatus";
import { GOAL_SORT_LABELS, pinHouseholdGoalsFirst, sortGoals, type GoalSortLabel } from "@/utils/goalSort";
import type { FinancialGoalOut } from "@/types";

/** 수정 모달 제목 — 목표 유형마다 다르다. */
function goalFormTitle(formTarget: "new-goal" | FinancialGoalOut): string {
  if (formTarget === "new-goal") return "목표 추가";
  if (formTarget.kind === "challenge") return "챌린지 수정";
  if (formTarget.kind === "net_worth") return "순자산 목표 수정";
  if (formTarget.kind === "combined") return "통합 목표 수정";
  return "재무목표 수정";
}

/** 목표 탭 — 장기목표/챌린지를 함께 관리한다. 현금흐름 계획(가계 전체 달력월 기준 수입·지출
 * 계획)과는 별개의 독립 탭이다: 개별 목표는 각자 다른 기간(목표일)을 기준으로 한 "전체 목표
 * 설정 → 월별 계획 → 월별 달성 확인" 루프를 갖기 때문(frontend/CLAUDE.md 참고). */
export default function GoalsTab() {
  const [formTarget, setFormTarget] = useState<"new-goal" | FinancialGoalOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [sortOption, setSortOption] = useState<GoalSortLabel>("우선순위순");

  const goalsQuery = useGoals();
  const { data: savingsProducts } = useSavingsProducts();
  const { data: accounts } = useAccounts();
  const { data: loans } = useLoans();
  const { data: users } = useUsers();
  const { data: me } = useMe();
  // 렌더 중 new Date()는 비순수 호출이라(oxlint) 화면을 연 시점을 한 번만 잡는다(동기화 오래됨 판정용).
  const [openedAt] = useState(() => new Date());
  const { createMutation, updateMutation, removeMutation: deleteMutation, invalidate } = useCrudMutations({
    // 목표 연동이 바뀌면 저축상품의 linked_goal_id/linked_goal_name(자산·계획 탭 배지)도 바뀌므로 저축상품
    // 관련 쿼리도 함께 무효화한다(savingsProducts는 계획·연간계획 키의 공통 프리픽스). 대시보드 본문의 목표
    // 페이스·잉여자금 코칭도 목표를 읽는다.
    invalidateKeys: [
      QUERY_KEYS.financialGoals,
      QUERY_KEYS.savingsProducts,
      QUERY_KEYS.dashboardBootstrap,
      QUERY_KEYS.dashboardAll,
    ],
    api: { create: createGoal, update: updateGoal, remove: deleteGoal },
    messages: { create: "추가했습니다.", update: "저장했습니다.", remove: "삭제했습니다." },
    onCreateSuccess: (goal) => {
      setFormTarget(null);
      // 통합 목표를 막 만들었으면 내 growlio 목표 값을 바로 불러와 합계에 넣는다(배우자 값은 배우자가 앱을 열 때).
      // 실패(growlio 미설정·접속 실패)해도 목표는 이미 저장됐으니 조용히 넘어간다 — 다음 화면 로드 때 다시 시도한다.
      if (goal.kind === "combined") {
        refreshGrowlioGoalSnapshot()
          .then(() => invalidate())
          .catch(() => undefined);
      }
    },
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeleteTarget(null),
  });

  return (
    <QueryBoundary query={goalsQuery}>
      {(data) => {
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const priorityOrderedGoals = data.slice().sort((a, b) => a.priority - b.priority);
  // 달성한 목표는 활성 목록에서 분리해 아래 접이식으로 옮긴다 — 완료된 항목이 계속 쌓여
  // 목록을 채우는 것을 막기 위함(백엔드에 별도 archive 필드는 없음, 순수 프론트 판정).
  const activeGoalsByPriority = priorityOrderedGoals.filter((g) => !isGoalAchieved(g));
  const achievedGoals = priorityOrderedGoals.filter((g) => isGoalAchieved(g));
  const activeGoals = pinHouseholdGoalsFirst(sortGoals(activeGoalsByPriority, sortOption));

  const handleSubmit = (draft: Draft) => {
    const oldPct = formTarget !== null && typeof formTarget === "object" ? Number(formTarget.progress_pct) : 0;
    if (formTarget === "new-goal") {
      createMutation.mutate(toPayload(draft), { onSuccess: (goal) => celebrateIfCrossed(oldPct, goal) });
    } else if (formTarget) {
      updateMutation.mutate(
        { id: formTarget.id, payload: toPayload(draft) },
        { onSuccess: (goal) => celebrateIfCrossed(oldPct, goal) },
      );
    }
  };

  const renderGoalCard = (goal: FinancialGoalOut) => (
    <GoalListCard
      key={goal.id}
      goal={goal}
      meId={me?.id ?? null}
      openedAt={openedAt}
      onEdit={() => setFormTarget(goal)}
      onDelete={() => setDeleteTarget(goal.id)}
      onSaved={invalidate}
    />
  );

  const modalInitial =
    formTarget === "new-goal" ? EMPTY_GOAL_DRAFT : formTarget !== null ? draftFromGoal(formTarget) : null;
  return (
    <div className="space-y-6">
      <Link
        to={planViewLink("연간")}
        className="block text-xs text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-primary-400"
      >
        올해 저축 계획·실적은 연간 탭에서 →
      </Link>

      <GoalSectionHeader
        title="목표"
        description={
          <CollapsibleHint summary="목표금액·목표일을 정하면 월별 계획이 자동으로 나뉘어요.">
            저축·투자 상품이나 계좌를 연동하면 이번 달 달성 여부까지 거래내역으로 자동 확인돼요. 부부가 짧게 도전하는
            챌린지도 목표 추가 시 유형으로 선택할 수 있어요. 통합 목표로 장기 목표와 부부 각자의 growlio 투자목표를 하나로
            묶어 볼 수 있어요.
          </CollapsibleHint>
        }
        action={
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new-goal")}>
            목표 추가
          </Button>
        }
      />

      {data.length === 0 ? (
        <EmptyState
          icon={Target}
          title="등록된 재무목표가 없어요"
          description="위 버튼으로 첫 재무목표나 챌린지를 만들어보세요"
          compact
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">총 {data.length}개</p>
            {activeGoals.length > 1 && (
              <Tabs tabs={GOAL_SORT_LABELS} activeTab={sortOption} onChange={setSortOption} variant="pill" />
            )}
          </div>

          {activeGoals.length > 0 ? (
            <div className="space-y-2">{activeGoals.map(renderGoalCard)}</div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 py-1">
              진행 중인 목표가 없어요. 모든 목표를 달성했어요! 🎉
            </p>
          )}

          {achievedGoals.length > 0 && (
            <CollapsibleGroup
              header={
                <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  <Trophy size={14} className="text-primary-500" />
                  달성한 목표
                </span>
              }
              amount={`${achievedGoals.length}개`}
              defaultOpen={false}
            >
              {achievedGoals.map(renderGoalCard)}
            </CollapsibleGroup>
          )}
        </div>
      )}

      {modalInitial && (
        <GoalFormModal
          initial={modalInitial}
          title={goalFormTitle(formTarget!)}
          submitLabel={formTarget === "new-goal" ? "추가" : "저장"}
          submitting={isSaving}
          savingsProducts={savingsProducts ?? []}
          accounts={accounts ?? []}
          loans={loans ?? []}
          existingGoal={typeof formTarget === "object" ? formTarget : null}
          canCreateNetWorth={!(goalsQuery.data ?? []).some((g) => g.kind === "net_worth")}
          canCreateCombined={!(goalsQuery.data ?? []).some((g) => g.kind === "combined")}
          goals={goalsQuery.data ?? []}
          users={users ?? []}
          onClose={() => setFormTarget(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deleteTarget !== null && (
        <ConfirmModal
          message="삭제할까요?"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
      }}
    </QueryBoundary>
  );
}
