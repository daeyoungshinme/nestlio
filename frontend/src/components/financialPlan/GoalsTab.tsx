import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Plus, Target, Trophy } from "lucide-react";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import FormInput from "@/components/common/FormInput";
import GoalFormModal from "@/components/financialPlan/GoalFormModal";
import { EMPTY_GOAL_DRAFT, draftFromGoal, toPayload, type Draft } from "@/components/financialPlan/goalDraft";
import GoalProgressCard from "@/components/financialPlan/GoalProgressCard";
import type { GoalProgressCardBadge, GoalProgressCardExtraDetail } from "@/components/financialPlan/GoalProgressCard";
import GoalSectionHeader from "@/components/financialPlan/GoalSectionHeader";
import SkeletonCard from "@/components/common/SkeletonCard";
import Tabs from "@/components/common/Tabs";
import { currentYearMonth } from "@/utils/date";
import { fetchDashboard } from "@/api/dashboard";
import { createGoal, deleteGoal, updateGoal, updateGoalMonthlyTarget } from "@/api/goals";
import { INLINE_BUTTON_OFFSET } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { useAccounts, useGoals, useLoans, useSavingsProducts } from "@/hooks/useReferenceData";
import { planViewLink } from "@/constants/routes";
import { progressStatusBadgeClass, progressStatusLabel } from "@/utils/colors";
import { computeCardStatus, daysUntil, isGoalAchieved } from "@/utils/goalStatus";
import { GOAL_SORT_LABELS, sortGoals, type GoalSortLabel } from "@/utils/goalSort";
import { estimateGoalAcceleration } from "@/utils/monthRange";
import { extractErrorMessage } from "@/utils/error";
import { formatDate, formatKrw, formatKrwPreview, formatYearMonth, toAmountInputValue } from "@/utils/format";
import { toast } from "@/utils/toast";
import { findGrowlioInvestmentLink, GROWLIO_APP_URL, growlioPortfolioUrl } from "@/constants/growlio";
import type { FinancialGoalOut, FinancialGoalUpdateIn, GoalKind } from "@/types";

const GOAL_MILESTONES = [25, 50, 75, 100];


/** 저장 전후 진행률을 비교해 이번 저장으로 새로 넘어선 가장 높은 마일스톤을 반환한다 (없으면 null).
 * 챌린지는 실제 축하 이메일이 100%에서만 나가므로(app/services/notification_service.py) 프론트
 * 토스트도 100%만 축하한다 — 목표는 25/50/75/100% 전부 축하한다. */
function crossedMilestone(oldPct: number, newPct: number, kind: GoalKind): number | null {
  const milestones = kind === "challenge" ? [100] : GOAL_MILESTONES;
  const crossed = milestones.filter((m) => oldPct < m && newPct >= m);
  return crossed.length > 0 ? Math.max(...crossed) : null;
}

/** 목표 탭 — 장기목표/챌린지를 함께 관리한다. 현금흐름 계획(가계 전체 달력월 기준 수입·지출
 * 계획)과는 별개의 독립 탭이다: 개별 목표는 각자 다른 기간(목표일)을 기준으로 한 "전체 목표
 * 설정 → 월별 계획 → 월별 달성 확인" 루프를 갖기 때문(frontend/CLAUDE.md 참고). */
export default function GoalsTab() {
  const yearMonth = currentYearMonth();
  const [formTarget, setFormTarget] = useState<"new-goal" | FinancialGoalOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [sortOption, setSortOption] = useState<GoalSortLabel>("우선순위순");
  const [progressDraft, setProgressDraft] = useState<Record<number, string>>({});
  const [monthlyTargetDraft, setMonthlyTargetDraft] = useState<Record<string, string>>({});

  const { data, isLoading, isError, refetch } = useGoals();
  const { data: savingsProducts } = useSavingsProducts();
  const { data: accounts } = useAccounts();
  const { data: loans } = useLoans();
  // goal_pace 코칭 문구는 대시보드 카드에서만 보여준다(중복 노출 제거). 이 쿼리는
  // investable_surplus(이번 달 여유자금 힌트, 아래 사용처 참고)를 위해 유지한다.
  const { data: dashboard } = useQuery({
    queryKey: QUERY_KEYS.dashboard("month", currentYearMonth()),
    queryFn: () => fetchDashboard("month", currentYearMonth()),
    staleTime: STALE_TIME.SHORT,
  });

  const year = Number(yearMonth.slice(0, 4));
  const { createMutation, updateMutation, removeMutation: deleteMutation, invalidate } = useCrudMutations({
    // 목표에 연동된 저축상품의 월 계획액이 목표 저장 시 함께 갱신되므로(app/services/goal_service.py::
    // _sync_funding_product_monthly_amount), 저축상품 관련 쿼리도 함께 무효화한다.
    invalidateKeys: [
      QUERY_KEYS.financialGoals,
      QUERY_KEYS.savingsProducts,
      QUERY_KEYS.savingsProductsPlan(yearMonth),
      QUERY_KEYS.savingsProductsAnnualPlan(year),
    ],
    api: { create: createGoal, update: updateGoal, remove: deleteGoal },
    messages: { create: "추가했습니다.", update: "저장했습니다.", remove: "삭제했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeleteTarget(null),
  });

  // 챌린지 카드의 "진행 금액 갱신" 인라인 저장 전용 — updateMutation과 달리 매번 "저장했습니다."를
  // 띄우지 않고, 목표 달성 여부에 따라 다른 토스트 하나만 보여준다.
  const progressMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: FinancialGoalUpdateIn }) => updateGoal(id, payload),
    onSuccess: (updated, { id }) => {
      invalidate();
      setProgressDraft((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      if (updated.status === "succeeded") {
        toast(`"${updated.name}" 챌린지 성공! 두 분이 함께 해냈어요 🎉`, "success");
      } else {
        toast("진행 금액을 저장했습니다.", "success");
      }
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  // 장기목표 카드의 월별 행 인라인 "이번 달 저축액 입력" 저장 전용 — progressMutation과 같은
  // 톤으로 전체 목표를 다시 보내지 않고 그 달의 achieved_amount만 갱신한다. 연동된 장기목표는
  // 이 mutation을 쓰지 않는다(자동계산이라 저장 버튼 자체가 없음).
  const monthlyTargetMutation = useMutation({
    mutationFn: ({ goalId, yearMonth, achievedAmount }: { goalId: number; yearMonth: string; achievedAmount: string }) =>
      updateGoalMonthlyTarget(goalId, yearMonth, achievedAmount),
    onSuccess: (_updated, { goalId, yearMonth }) => {
      invalidate();
      setMonthlyTargetDraft((d) => {
        const next = { ...d };
        delete next[`${goalId}-${yearMonth}`];
        return next;
      });
      toast("이번 달 저축액을 저장했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }
  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  const totalRequired = data.reduce((sum, g) => sum + Number(g.required_amount), 0);
  const totalMonthly = data.reduce((sum, g) => sum + Number(g.monthly_saving_amount), 0);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const investableSurplus = dashboard?.investable_surplus ?? "0";
  const priorityOrderedGoals = data.slice().sort((a, b) => a.priority - b.priority);
  // 달성한 목표는 활성 목록에서 분리해 아래 접이식으로 옮긴다 — 완료된 항목이 계속 쌓여
  // 목록을 채우는 것을 막기 위함(백엔드에 별도 archive 필드는 없음, 순수 프론트 판정).
  const activeGoalsByPriority = priorityOrderedGoals.filter((g) => !isGoalAchieved(g));
  const achievedGoals = priorityOrderedGoals.filter((g) => isGoalAchieved(g));
  const activeGoals = sortGoals(activeGoalsByPriority, sortOption);
  // 여유자금은 가구 전체 단위라 목표마다 반복 표시하면 목표별로 다른 금액처럼 오인될 수 있어,
  // growlio 연동된 활성 목표 중 우선순위가 가장 높은 하나에만 붙인다(정렬 옵션과 무관하게 고정).
  const firstGrowlioLinkedGoalId =
    activeGoalsByPriority.find((g) => findGrowlioInvestmentLink(g, savingsProducts ?? []))?.id ?? null;

  const celebrateIfCrossed = (oldPct: number, goal: FinancialGoalOut) => {
    const milestone = crossedMilestone(oldPct, Number(goal.progress_pct), goal.kind);
    if (milestone !== null) {
      const label = goal.kind === "challenge" ? "챌린지" : "목표";
      toast(`"${goal.name}" ${label} ${milestone}% 달성! 축하해요 🎉`, "success");
    }
  };

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

  const handleUpdateProgress = (goal: FinancialGoalOut, current_amount: string) => {
    const payload = { ...toPayload(draftFromGoal(goal)), current_amount };
    progressMutation.mutate({ id: goal.id, payload });
  };

  const handleUpdateMonthlyTarget = (goal: FinancialGoalOut, yearMonth: string, achievedAmount: string) => {
    const oldPct = Number(goal.progress_pct);
    monthlyTargetMutation.mutate(
      { goalId: goal.id, yearMonth, achievedAmount },
      { onSuccess: (updated) => celebrateIfCrossed(oldPct, updated) },
    );
  };

  /** 활성/달성 목표 목록이 공유하는 카드 조립. 장기목표(goal)와 챌린지(challenge)는 같은
   * GoalProgressCard 조립을 공유한다 — 챌린지는 연동/월별계획을 쓰지 않는 필드 구성(toPayload
   * 참고)이라 관련 블록이 데이터 기반으로 자연히 비게 되고, 배지와 진행 금액 갱신 위젯 노출
   * 조건에서만 명시적으로 갈라진다. */
  const renderGoalCard = (goal: FinancialGoalOut) => {
    const isChallenge = goal.kind === "challenge";
    const growlioAccountId = findGrowlioInvestmentLink(goal, savingsProducts ?? []);
    const showSurplusHint =
      goal.id === firstGrowlioLinkedGoalId && GROWLIO_APP_URL && Number(investableSurplus) > 0;
    const hasLoanSource = goal.funding_sources.some((fs) => fs.type === "loan");
    const status = computeCardStatus(goal);

    // 이번 달 아직 달성 못한 가장 이른 달 — 연동 목표는 거래내역 기반 자동계산값(is_auto_computed)이라
    // 저장 버튼 없이 읽기 전용으로 보여주고, 미연동 목표는 인라인 입력을 쓴다
    // (app/services/goal_service.py::compute_linked_monthly_achieved 참고). 챌린지는 월별 계획
    // 자체가 없어(toPayload에서 항상 monthly_targets: null로 저장) 이 블록이 자연히 no-op된다.
    const activeMonth = goal.monthly_targets.find((mt) => !mt.is_achieved) ?? null;
    const isAutoComputed = activeMonth?.is_auto_computed ?? false;
    const draftKey = activeMonth && !isAutoComputed ? `${goal.id}-${activeMonth.year_month}` : null;
    const monthlyDraftValue =
      draftKey !== null
        ? (monthlyTargetDraft[draftKey] ?? toAmountInputValue(activeMonth!.achieved_amount))
        : "0";

    // 연동(funding_sources)도 없고 월별 계획(monthly_targets)도 없는 목표는 거래내역이나 월별
    // 그리드로 진행률을 갱신할 방법이 없어, 카드에서 현재 금액을 직접 입력해 갱신한다. 챌린지는
    // 애초에 연동·월별계획 개념이 없어(toPayload 참고) 활성 상태인 동안 항상 이 경로를 탄다 —
    // 만료된 챌린지는 더 이상 갱신할 수 없어 위젯을 숨긴다.
    const progressDraftValue = progressDraft[goal.id] ?? toAmountInputValue(goal.current_amount);
    const showProgressUpdateWidget =
      goal.funding_sources.length === 0 &&
      goal.monthly_targets.length === 0 &&
      (isChallenge ? goal.effective_status === "active" : status !== "achieved");

    const badges: GoalProgressCardBadge[] = [
      { label: progressStatusLabel(status), toneClassName: progressStatusBadgeClass(status) },
    ];
    if (isChallenge) {
      badges.push({ label: "챌린지", toneClassName: progressStatusBadgeClass("neutral") });
    }
    if (isAutoComputed) {
      badges.push({ label: "이번 달 자동계산", toneClassName: progressStatusBadgeClass("neutral") });
    }

    const growlioDetail =
      growlioAccountId && GROWLIO_APP_URL ? (
        <a
          href={growlioPortfolioUrl(growlioAccountId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          <ExternalLink size={12} />
          이 목표의 투자금, growlio에서 포트폴리오로 굴리기
        </a>
      ) : null;

    const extraDetails: GoalProgressCardExtraDetail[] = [];
    if (goal.funding_sources.length > 0) {
      extraDetails.push({
        key: "funding-sources",
        content: (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-40 overflow-y-auto">
            {goal.funding_sources.map((fs) => (
              <div key={`${fs.type}-${fs.id}`} className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="truncate">{fs.name}</span>
                <span className="shrink-0">{formatKrw(fs.amount)}</span>
              </div>
            ))}
          </div>
        ),
      });
    }
    if (goal.monthly_targets.length > 0) {
      extraDetails.push({
        key: "monthly-targets",
        content: (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-40 overflow-y-auto">
            {goal.monthly_targets.map((mt) => (
              <div key={mt.year_month} className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="truncate">
                  {mt.is_achieved ? "✅ " : ""}
                  {mt.year_month}
                </span>
                <span className="shrink-0">
                  {formatKrw(mt.achieved_amount)} / {formatKrw(mt.target_amount)}
                </span>
              </div>
            ))}
          </div>
        ),
      });
    }
    if (!isChallenge && goal.eta_year_month) {
      const ab = goal.ahead_behind_months;
      extraDetails.push({
        key: "eta",
        content: `현재 저축 속도면 ${formatYearMonth(goal.eta_year_month)} 도달 예상${
          ab !== null ? ` · 목표일 대비 ${Math.abs(ab)}개월 ${ab >= 0 ? "빠름" : "늦음"}` : ""
        }`,
      });
    }
    if (showSurplusHint) {
      const acceleration = estimateGoalAcceleration(
        goal.required_amount,
        goal.current_amount,
        goal.months_remaining,
        goal.suggested_monthly_amount,
        investableSurplus,
      );
      extraDetails.push({
        key: "surplus",
        content: acceleration
          ? `이번 달 여유자금 ${formatKrw(investableSurplus)}를 이 목표의 투자금에 보태면 달성까지 ${goal.months_remaining}개월 → ${acceleration.newMonthsRemaining}개월로 ${acceleration.monthsSaved}개월 앞당길 수 있어요. (가계 전체 여유자금이라 growlio 연동된 목표 중 1순위에만 표시돼요)`
          : `이번 달 여유자금 ${formatKrw(investableSurplus)}, 이 목표의 투자금에 보태보세요. (가계 전체 여유자금이라 growlio 연동된 목표 중 1순위에만 표시돼요)`,
      });
    }
    return (
      <GoalProgressCard
        key={goal.id}
        title={goal.name}
        metaLine={`${goal.priority}순위${
          goal.target_date !== null
            ? ` · D-${daysUntil(goal.target_date)}`
            : goal.target_age !== null
              ? ` · ${goal.target_age}세까지`
              : ""
        }${goal.funding_sources.length > 0 ? ` · 연동 ${goal.funding_sources.length}건` : ""}`}
        badges={badges}
        subtitle={
          goal.description || (goal.start_date && goal.target_date) ? (
            <>
              {goal.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{goal.description}</p>
              )}
              {goal.start_date && goal.target_date && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                  {formatDate(goal.start_date)} ~ {formatDate(goal.target_date)}
                </p>
              )}
            </>
          ) : undefined
        }
        pct={Number(goal.progress_pct)}
        primaryDetail={
          <>
            {goal.funding_sources.length > 0 ? "연동 항목 잔액 합계" : "현재 저축액"}{" "}
            {formatKrw(goal.current_amount)} / 목표 {formatKrw(goal.required_amount)}
            {!isChallenge && <> · 월 {formatKrw(goal.monthly_saving_amount)}</>}
            {hasLoanSource && " (대출 차감 반영)"}
          </>
        }
        pinnedDetail={growlioDetail}
        extraDetails={extraDetails}
        onEdit={() => setFormTarget(goal)}
        onDelete={() => setDeleteTarget(goal.id)}
        footer={
          showProgressUpdateWidget ? (
            <div className="flex items-start flex-wrap gap-2 pt-1">
              <FormInput
                label="진행 금액 갱신"
                type="number"
                inputMode="decimal"
                value={progressDraftValue}
                onChange={(e) => setProgressDraft((d) => ({ ...d, [goal.id]: e.target.value }))}
                className="w-full sm:w-40"
                preview={Number(progressDraftValue) > 0 ? formatKrwPreview(Number(progressDraftValue)) : undefined}
              />
              <Button
                size="sm"
                loading={progressMutation.isPending && progressMutation.variables?.id === goal.id}
                onClick={() => handleUpdateProgress(goal, progressDraftValue)}
                className={`${INLINE_BUTTON_OFFSET} ${TOUCH_TARGET_MIN_HEIGHT}`}
              >
                저장
              </Button>
            </div>
          ) : activeMonth && isAutoComputed ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
              {activeMonth.year_month} 이번 달 자동계산: {formatKrw(activeMonth.achieved_amount)} /{" "}
              {formatKrw(activeMonth.target_amount)}
            </p>
          ) : activeMonth && draftKey !== null ? (
            <div className="flex items-start flex-wrap gap-2 pt-1">
              <FormInput
                label={`${activeMonth.year_month} 저축액 입력`}
                type="number"
                inputMode="decimal"
                value={monthlyDraftValue}
                onChange={(e) => setMonthlyTargetDraft((d) => ({ ...d, [draftKey]: e.target.value }))}
                className="w-full sm:w-40"
                preview={Number(monthlyDraftValue) > 0 ? formatKrwPreview(Number(monthlyDraftValue)) : undefined}
              />
              <Button
                size="sm"
                loading={monthlyTargetMutation.isPending && monthlyTargetMutation.variables?.goalId === goal.id}
                onClick={() => handleUpdateMonthlyTarget(goal, activeMonth.year_month, monthlyDraftValue)}
                className={`${INLINE_BUTTON_OFFSET} ${TOUCH_TARGET_MIN_HEIGHT}`}
              >
                저장
              </Button>
            </div>
          ) : undefined
        }
      />
    );
  };

  const modalInitial =
    formTarget === "new-goal" ? EMPTY_GOAL_DRAFT : formTarget !== null ? draftFromGoal(formTarget) : null;
  const modalTitle =
    formTarget === "new-goal"
      ? "목표 추가"
      : formTarget !== null && formTarget.kind === "challenge"
        ? "챌린지 수정"
        : "재무목표 수정";

  return (
    <div className="space-y-6">
      <Link
        to={planViewLink("연간")}
        className="block text-xs text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-primary-400"
      >
        올해 저축 계획·실적(계획 수입 − 계획 지출 대비 실제 순저축)은 연간 탭에서 확인해요 →
      </Link>

      <GoalSectionHeader
        title="목표"
        description="전체 목표금액과 목표일을 정하면 월별 계획이 자동으로 나뉘어요. 저축·투자 상품이나 계좌를 연동하면 이번 달 달성 여부까지 거래내역으로 자동 확인돼요. 부부가 짧게 도전하는 챌린지도 목표 추가 시 유형으로 선택할 수 있어요."
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
            <p className="text-xs text-gray-500 dark:text-gray-400">
              총 {data.length}개 · 필요금액 합계 {formatKrw(totalRequired)} · 월 저축금액 합계{" "}
              {formatKrw(totalMonthly)}
            </p>
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
                  <Trophy size={14} className="text-emerald-500" />
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
          title={modalTitle}
          submitLabel={formTarget === "new-goal" ? "추가" : "저장"}
          submitting={isSaving}
          savingsProducts={savingsProducts ?? []}
          accounts={accounts ?? []}
          loans={loans ?? []}
          existingGoal={typeof formTarget === "object" ? formTarget : null}
          onClose={() => setFormTarget(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deleteTarget !== null && (
        <ConfirmModal
          message="삭제할까요?"
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

