import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Calendar, Download, ExternalLink, Plus, Target, Trophy } from "lucide-react";
import AnnualSavingsGoalCard from "@/components/financialPlan/AnnualSavingsGoalCard";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import FundingSourceChecklist from "@/components/financialPlan/FundingSourceChecklist";
import GoalMonthlyTargetEditor from "@/components/financialPlan/GoalMonthlyTargetEditor";
import GoalProgressCard from "@/components/financialPlan/GoalProgressCard";
import type { GoalProgressCardBadge, GoalProgressCardExtraDetail } from "@/components/financialPlan/GoalProgressCard";
import GoalSectionHeader from "@/components/financialPlan/GoalSectionHeader";
import Modal from "@/components/common/Modal";
import SkeletonCard from "@/components/common/SkeletonCard";
import Tabs from "@/components/common/Tabs";
import { currentYearMonth } from "@/components/common/MonthPicker";
import { fetchAccounts } from "@/api/accounts";
import { fetchDashboard } from "@/api/dashboard";
import {
  createGoal,
  deleteGoal,
  fetchGoals,
  fetchGrowlioGoalSettings,
  updateGoal,
  updateGoalMonthlyTarget,
} from "@/api/goals";
import { fetchLoans } from "@/api/loans";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { FORM_LABEL, FORM_SECTION_LABEL, INLINE_BUTTON_OFFSET, TEXTAREA_SM } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { progressStatusBadgeClass, progressStatusLabel } from "@/utils/colors";
import { computeCardStatus, daysUntil, isGoalAchieved } from "@/utils/goalStatus";
import { GOAL_SORT_LABELS, sortGoals, type GoalSortLabel } from "@/utils/goalSort";
import { syncTargetsToPeriod } from "@/utils/monthRange";
import { extractErrorMessage } from "@/utils/error";
import { formatDate, formatKrw, formatKrwPreview, formatPercent, toAmountInputValue } from "@/utils/format";
import { toast } from "@/utils/toast";
import { GROWLIO_APP_URL, growlioPortfolioUrl, isGrowlioLinkedInvestment } from "@/constants/growlio";
import type {
  AccountWithBalanceOut,
  FinancialGoalOut,
  FinancialGoalUpdateIn,
  FundingSourceIn,
  GoalKind,
  GoalMonthlyTargetIn,
  LoanOut,
  SavingsProductOut,
} from "@/types";

/** 목표에 연동된 저축/투자 상품 중 growlio에 연동된 투자 상품(가장 우선순위 높은 것)을 찾는다.
 * 이 목표를 위해 모은 투자금을 growlio 포트폴리오 화면으로 바로 이어주는 딥링크에 쓰인다. */
function findGrowlioInvestmentLink(
  goal: FinancialGoalOut,
  savingsProducts: SavingsProductOut[],
): string | null {
  const linkedIds = new Set(
    goal.funding_sources.filter((fs) => fs.type === "savings_product").map((fs) => fs.id),
  );
  const linked = savingsProducts.find((p) => linkedIds.has(p.id) && isGrowlioLinkedInvestment(p));
  return linked?.growlio_account_id ?? null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Draft {
  kind: GoalKind;
  priority: string;
  name: string;
  description: string;
  target_age: string;
  target_date: string;
  start_date: string;
  required_amount: string;
  monthly_saving_amount: string;
  current_amount: string;
  savings_product_ids: string[];
  account_ids: string[];
  loan_ids: string[];
  monthly_targets: GoalMonthlyTargetIn[];
}

const EMPTY_GOAL_DRAFT: Draft = {
  kind: "goal",
  priority: "1",
  name: "",
  description: "",
  target_age: "",
  target_date: "",
  start_date: "",
  required_amount: "0",
  monthly_saving_amount: "0",
  current_amount: "0",
  savings_product_ids: [],
  account_ids: [],
  loan_ids: [],
  monthly_targets: [],
};

const EMPTY_CHALLENGE_DRAFT: Draft = {
  ...EMPTY_GOAL_DRAFT,
  kind: "challenge",
  start_date: todayIso(),
  target_date: todayIso(),
};

const EMPTY_IRREGULAR_DRAFT: Draft = {
  ...EMPTY_GOAL_DRAFT,
  kind: "irregular",
  start_date: todayIso(),
  target_date: todayIso(),
};

/** "YYYY-MM-DD" -> "YYYY-MM" (GoalMonthlyTargetEditor에 넘길 시작월/종료월 계산용). */
function toYearMonth(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function draftFromGoal(goal: FinancialGoalOut): Draft {
  return {
    kind: goal.kind,
    priority: String(goal.priority),
    name: goal.name,
    description: goal.description ?? "",
    target_age: goal.target_age !== null ? String(goal.target_age) : "",
    target_date: goal.target_date ?? "",
    start_date: goal.start_date ?? todayIso(),
    required_amount: toAmountInputValue(goal.required_amount),
    monthly_saving_amount: toAmountInputValue(goal.monthly_saving_amount),
    current_amount: toAmountInputValue(goal.current_amount),
    savings_product_ids: goal.funding_sources.filter((fs) => fs.type === "savings_product").map((fs) => String(fs.id)),
    account_ids: goal.funding_sources.filter((fs) => fs.type === "account").map((fs) => String(fs.id)),
    loan_ids: goal.funding_sources.filter((fs) => fs.type === "loan").map((fs) => String(fs.id)),
    monthly_targets: goal.monthly_targets.map((mt) => ({
      year_month: mt.year_month,
      target_amount: toAmountInputValue(mt.target_amount),
    })),
  };
}

function toPayload(draft: Draft) {
  const isChallenge = draft.kind === "challenge";
  const isIrregular = draft.kind === "irregular";
  const isGoal = draft.kind === "goal";
  const funding_sources: FundingSourceIn[] =
    isChallenge || isIrregular
      ? []
      : [
          ...draft.savings_product_ids.map((id) => ({ type: "savings_product" as const, id: Number(id) })),
          ...draft.account_ids.map((id) => ({ type: "account" as const, id: Number(id) })),
          ...draft.loan_ids.map((id) => ({ type: "loan" as const, id: Number(id) })),
        ];
  const requiredAmount = isIrregular
    ? String(draft.monthly_targets.reduce((sum, t) => sum + (Number(t.target_amount) || 0), 0))
    : draft.required_amount;
  return {
    kind: draft.kind,
    priority: Number(draft.priority) || 1,
    name: draft.name,
    description: (isChallenge || isIrregular) && draft.description.trim() !== "" ? draft.description : null,
    target_age: isChallenge || isIrregular || draft.target_age === "" ? null : Number(draft.target_age),
    target_date: draft.target_date === "" ? null : draft.target_date,
    required_amount: requiredAmount,
    monthly_saving_amount: isChallenge || isIrregular ? "0" : draft.monthly_saving_amount,
    current_amount: draft.current_amount,
    funding_sources,
    start_date: isChallenge || isIrregular ? draft.start_date : null,
    // 장기목표(goal)는 irregular와 달리 필요금액을 합계로 덮어쓰지 않는다 — 월별 계획은 페이스
    // 참고용 그리드일 뿐이라 그대로 보낸다(FinancialGoalOut.required_amount 참고).
    monthly_targets: isIrregular || isGoal ? draft.monthly_targets : null,
  };
}

const GOAL_MILESTONES = [25, 50, 75, 100];

const GOAL_KIND_TABS = ["장기 목표", "챌린지"] as const;
type GoalKindTab = (typeof GOAL_KIND_TABS)[number];
const GOAL_KIND_TAB_TO_KIND: Record<GoalKindTab, "goal" | "challenge"> = {
  "장기 목표": "goal",
  챌린지: "challenge",
};
const KIND_TO_GOAL_KIND_TAB: Record<"goal" | "challenge", GoalKindTab> = {
  goal: "장기 목표",
  challenge: "챌린지",
};

/** 저장 전후 진행률을 비교해 이번 저장으로 새로 넘어선 가장 높은 마일스톤을 반환한다 (없으면 null).
 * 챌린지는 실제 축하 이메일이 100%에서만 나가므로(app/services/notification_service.py) 프론트
 * 토스트도 100%만 축하한다 — 목표는 25/50/75/100% 전부 축하한다. */
function crossedMilestone(oldPct: number, newPct: number, kind: GoalKind): number | null {
  const milestones = kind === "challenge" ? [100] : GOAL_MILESTONES;
  const crossed = milestones.filter((m) => oldPct < m && newPct >= m);
  return crossed.length > 0 ? Math.max(...crossed) : null;
}

/** start~end 사이 전체 개월 수 — 백엔드 app/utils/dates.py::months_between과 동일한 규칙(일 차이는 무시). */
function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

/** 목표 탭 — 장기목표/챌린지/비정기목표를 함께 관리한다. 현금흐름 계획(가계 전체 달력월 기준
 * 수입·지출 계획)과는 별개의 독립 탭이다: 개별 목표는 각자 다른 기간(목표일)을 기준으로 한
 * "전체 목표 설정 → 월별 계획 → 월별 달성 확인" 루프를 갖기 때문(frontend/CLAUDE.md 참고). */
export default function GoalsTab() {
  const yearMonth = currentYearMonth();
  const [formTarget, setFormTarget] = useState<"new-goal" | "new-irregular" | FinancialGoalOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [sortOption, setSortOption] = useState<GoalSortLabel>("우선순위순");
  const [progressDraft, setProgressDraft] = useState<Record<number, string>>({});
  const [monthlyTargetDraft, setMonthlyTargetDraft] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.financialGoals, queryFn: fetchGoals });
  const { data: savingsProducts } = useQuery({
    queryKey: QUERY_KEYS.savingsProducts,
    queryFn: fetchSavingsProducts,
    staleTime: STALE_TIME.MEDIUM,
  });
  const { data: accounts } = useQuery({
    queryKey: QUERY_KEYS.accounts,
    queryFn: fetchAccounts,
    staleTime: STALE_TIME.MEDIUM,
  });
  const { data: loans } = useQuery({
    queryKey: QUERY_KEYS.loans,
    queryFn: fetchLoans,
    staleTime: STALE_TIME.MEDIUM,
  });
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

  // 비정기목표·장기목표 카드의 월별 행 인라인 "이번 달 저축액 입력" 저장 전용 — progressMutation과
  // 같은 톤으로 전체 목표를 다시 보내지 않고 그 달의 achieved_amount만 갱신한다. 연동된 장기목표는
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
    if (formTarget === "new-goal" || formTarget === "new-irregular") {
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

  /** 활성/달성 목표 목록이 공유하는 카드 조립. 비정기목표(kind="irregular")는 월별 계획을
   * 상향식으로 입력하는 방식이 근본적으로 달라 별도 분기로 렌더링한다. 장기목표(goal)와
   * 챌린지(challenge)는 같은 GoalProgressCard 조립을 공유한다 — 챌린지는 연동/월별계획을 쓰지
   * 않는 필드 구성(toPayload 참고)이라 관련 블록이 데이터 기반으로 자연히 비게 되고, 배지와
   * 진행 금액 갱신 위젯 노출 조건에서만 명시적으로 갈라진다. */
  const renderGoalCard = (goal: FinancialGoalOut) => {
    if (goal.kind === "irregular") {
      const status = computeCardStatus(goal);
      const badges: GoalProgressCardBadge[] = [
        { label: progressStatusLabel(status), toneClassName: progressStatusBadgeClass(status) },
        { label: "비정기목표", toneClassName: progressStatusBadgeClass("neutral") },
      ];
      // 아직 달성하지 못한 가장 이른 달을 "지금 채워야 할 달"로 삼아 인라인 입력을 붙인다 —
      // 지난 달을 고치고 싶으면 수정 모달에서 기간·월별 계획을 다시 조정한다.
      const activeMonth = goal.monthly_targets.find((mt) => !mt.is_achieved) ?? null;
      const draftKey = activeMonth ? `${goal.id}-${activeMonth.year_month}` : null;
      const monthlyDraftValue =
        draftKey !== null
          ? (monthlyTargetDraft[draftKey] ?? toAmountInputValue(activeMonth!.achieved_amount))
          : "0";

      return (
        <GoalProgressCard
          key={goal.id}
          title={goal.name}
          badges={badges}
          subtitle={
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
          }
          pct={Number(goal.progress_pct)}
          primaryDetail={
            <>
              {formatKrw(goal.current_amount)} / 목표 {formatKrw(goal.required_amount)}
            </>
          }
          extraDetails={[
            {
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
            },
          ]}
          onEdit={() => setFormTarget(goal)}
          onDelete={() => setDeleteTarget(goal.id)}
          footer={
            activeMonth &&
            draftKey !== null && (
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
            )
          }
        />
      );
    }

    const isChallenge = goal.kind === "challenge";
    const growlioAccountId = findGrowlioInvestmentLink(goal, savingsProducts ?? []);
    const showSurplusHint =
      goal.id === firstGrowlioLinkedGoalId && GROWLIO_APP_URL && Number(investableSurplus) > 0;
    const hasLoanSource = goal.funding_sources.some((fs) => fs.type === "loan");
    const status = computeCardStatus(goal);

    // 이번 달 아직 달성 못한 가장 이른 달 — 연동 목표는 거래내역 기반 자동계산값(is_auto_computed)이라
    // 저장 버튼 없이 읽기 전용으로 보여주고, 미연동 목표는 비정기목표와 같은 인라인 입력을 쓴다
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
    if (showSurplusHint) {
      extraDetails.push({
        key: "surplus",
        content: `이번 달 여유자금 ${formatKrw(investableSurplus)}, 이 목표의 투자금에 보태보세요. (가계 전체 여유자금이라 growlio 연동된 목표 중 1순위에만 표시돼요)`,
      });
    }
    if (goal.weighted_return_rate_pct !== null && goal.projected_months_with_growth !== null) {
      extraDetails.push({
        key: "projection",
        content: `연동 투자상품 수익률 ${formatPercent(Number(goal.weighted_return_rate_pct))}(가정) 반영 시 약 ${goal.projected_months_with_growth}개월 후 달성 예상`,
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
    formTarget === "new-goal"
      ? EMPTY_GOAL_DRAFT
      : formTarget === "new-irregular"
        ? EMPTY_IRREGULAR_DRAFT
        : formTarget !== null
          ? draftFromGoal(formTarget)
          : null;
  const modalTitle =
    formTarget === "new-goal"
      ? "목표 추가"
      : formTarget === "new-irregular"
        ? "비정기 목표 추가"
        : formTarget !== null && formTarget.kind === "challenge"
          ? "챌린지 수정"
          : formTarget !== null && formTarget.kind === "irregular"
            ? "비정기 목표 수정"
            : "재무목표 수정";

  return (
    <div className="space-y-6">
      <AnnualSavingsGoalCard />

      <Link
        to="/financial-plan?tab=현금흐름 계획&view=연간계획"
        className="block text-xs text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400"
      >
        이번 달 수입·지출 상세 계획은 현금흐름 계획 탭에서 조정해요 → 연간계획 보기
      </Link>

      <GoalSectionHeader
        title="목표 · 비정기목표"
        description="전체 목표금액과 목표일을 정하면 월별 계획이 자동으로 나뉘어요. 저축·투자 상품이나 계좌를 연동하면 이번 달 달성 여부까지 거래내역으로 자동 확인돼요. 부부가 짧게 도전하는 챌린지도 목표 추가 시 유형으로 선택할 수 있고, 여행자금·명절비용처럼 기간을 정해 모으는 비정기 목표도 함께 관리해요."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Calendar size={14} />} onClick={() => setFormTarget("new-irregular")}>
              비정기 목표 추가
            </Button>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new-goal")}>
              목표 추가
            </Button>
          </div>
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
          submitLabel={formTarget === "new-goal" || formTarget === "new-irregular" ? "추가" : "저장"}
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

function GoalFormModal({
  initial,
  title,
  submitLabel,
  submitting,
  savingsProducts,
  accounts,
  loans,
  existingGoal,
  onClose,
  onSubmit,
}: {
  initial: Draft;
  title: string;
  submitLabel: string;
  submitting: boolean;
  savingsProducts: SavingsProductOut[];
  accounts: AccountWithBalanceOut[];
  loans: LoanOut[];
  existingGoal: FinancialGoalOut | null;
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [currentAge, setCurrentAge] = useState("");
  const [confirmingResync, setConfirmingResync] = useState(false);
  const isChallenge = draft.kind === "challenge";
  const isIrregular = draft.kind === "irregular";
  // 유형 선택은 생성 시에만 가능하다(백엔드 FinancialGoalUpdateIn에 kind 필드 자체가 없어 생성 후
  // 유형 변경이 불가능) — 수정 모드에서는 토글을 숨기고 기존 kind별 폼만 보여준다. 이름은 유형을
  // 바꿔도 다시 입력하지 않도록 보존하고, 나머지 필드는 빈 초안으로 리셋한다(필드 구성이 크게 다름).
  const kindToggle =
    existingGoal === null && !isIrregular ? (
      <Tabs
        tabs={GOAL_KIND_TABS}
        activeTab={KIND_TO_GOAL_KIND_TAB[draft.kind as "goal" | "challenge"]}
        onChange={(tab) => {
          const nextKind = GOAL_KIND_TAB_TO_KIND[tab];
          setDraft((d) => ({
            ...(nextKind === "challenge" ? EMPTY_CHALLENGE_DRAFT : EMPTY_GOAL_DRAFT),
            name: d.name,
          }));
        }}
        variant="pill"
      />
    ) : null;
  const isLinked =
    draft.savings_product_ids.length > 0 || draft.account_ids.length > 0 || draft.loan_ids.length > 0;
  // 다른 목표에 이미 연동된 상품은 선택지에서 제외 — 연동되면 어느 목표를 따를지 모호해지기 때문.
  // 지금 이 목표에 이미 연동된 상품(existingGoal.id와 일치)은 계속 보여준다.
  const availableSavingsProducts = savingsProducts.filter(
    (p) => p.linked_goal_id === null || p.linked_goal_id === existingGoal?.id,
  );

  // 시작일/종료일이 바뀌면 월별 목표금액 행도 그 기간에 맞춰 다시 맞춘다 — 겹치는 달의 금액은 보존.
  const syncMonthlyTargetsToPeriod = (startDate: string, targetDate: string, existing: GoalMonthlyTargetIn[]) =>
    syncTargetsToPeriod(toYearMonth(startDate), toYearMonth(targetDate), existing);

  // 이미 지난 달인데 목표에 못 미친 금액(부족분)을, 아직 달성하지 못한 이번 달 이후 달들에
  // 균등하게 나눠 더한다. 이미 지난/달성한 달의 target_amount는 건드리지 않는다 — 기록 보존.
  const handleRedistributeShortfall = () => {
    if (!existingGoal) return;
    const nowYm = currentYearMonth();
    const achievedByMonth = new Map(existingGoal.monthly_targets.map((mt) => [mt.year_month, mt.achieved_amount]));
    const pastShortfall = existingGoal.monthly_targets
      .filter((mt) => mt.year_month < nowYm)
      .reduce((sum, mt) => sum + Math.max(0, Number(mt.target_amount) - Number(mt.achieved_amount)), 0);
    const remainingMonths = draft.monthly_targets.filter((t) => {
      if (t.year_month < nowYm) return false;
      const achieved = achievedByMonth.get(t.year_month);
      return achieved === undefined || Number(achieved) < Number(t.target_amount);
    });
    if (pastShortfall <= 0 || remainingMonths.length === 0) {
      toast("재배분할 부족분이 없어요.", "info");
      return;
    }
    const addPerMonth = pastShortfall / remainingMonths.length;
    const remainingSet = new Set(remainingMonths.map((t) => t.year_month));
    setDraft((d) => ({
      ...d,
      monthly_targets: d.monthly_targets.map((t) =>
        remainingSet.has(t.year_month)
          ? { ...t, target_amount: String(Math.round(Number(t.target_amount) + addPerMonth)) }
          : t,
      ),
    }));
    toast(
      `부족분 ${formatKrw(Math.round(pastShortfall))}을 남은 ${remainingMonths.length}개월에 나눠 반영했어요. 저장을 눌러야 적용돼요.`,
      "success",
    );
  };

  const growlioGoalMutation = useMutation({
    mutationFn: fetchGrowlioGoalSettings,
    onSuccess: (data) => {
      if (!data.is_configured || data.goal_amount === null) {
        toast("growlio에 설정된 투자목표가 없어요.", "error");
        return;
      }
      // 다른 목표에 이미 연동된 상품은 후보에서 제외(availableSavingsProducts 참고).
      const growlioProductIds = availableSavingsProducts.filter(isGrowlioLinkedInvestment).map((p) => String(p.id));
      setDraft((d) => ({
        ...d,
        name: d.name.trim() === "" ? "growlio 투자목표" : d.name,
        required_amount: String(Math.round(data.goal_amount as number)),
        monthly_saving_amount:
          data.annual_deposit_goal !== null
            ? String(Math.round(data.annual_deposit_goal / 12))
            : d.monthly_saving_amount,
        savings_product_ids: growlioProductIds.length > 0 ? growlioProductIds : d.savings_product_ids,
      }));
      toast(
        growlioProductIds.length > 0
          ? "growlio 투자목표를 불러왔어요."
          : "growlio 투자목표를 불러왔어요. 저축·투자 상품 탭에서 growlio 계좌를 먼저 가져오면 진행률이 자동 반영돼요.",
        "success",
      );
    },
    onError: (err) => toast(extractErrorMessage(err, "growlio 투자목표를 불러오지 못했습니다."), "error"),
  });

  const toggleId = (field: "savings_product_ids" | "account_ids" | "loan_ids", id: string) => {
    setDraft((d) => ({
      ...d,
      [field]: d[field].includes(id) ? d[field].filter((v) => v !== id) : [...d[field], id],
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit(draft);
  };

  if (isChallenge) {
    return (
      <Modal onClose={onClose} title={title}>
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
          {kindToggle}
          <FormInput
            label="챌린지 제목"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full"
            required
          />
          <div>
            <label className={FORM_LABEL}>설명 (선택)</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              className={`w-full ${TEXTAREA_SM}`}
              rows={2}
            />
          </div>
          <FormInput
            label="목표 금액"
            type="number"
            inputMode="decimal"
            value={draft.required_amount}
            onChange={(e) => setDraft((d) => ({ ...d, required_amount: e.target.value }))}
            className="w-full"
            preview={Number(draft.required_amount) > 0 ? formatKrwPreview(Number(draft.required_amount)) : undefined}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="시작일"
              type="date"
              value={draft.start_date}
              onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
              className="w-full"
            />
            <FormInput
              label="종료일"
              type="date"
              value={draft.target_date}
              onChange={(e) => setDraft((d) => ({ ...d, target_date: e.target.value }))}
              className="w-full"
              min={draft.start_date}
            />
          </div>
          {existingGoal && (
            <FormInput
              label="진행 금액"
              type="number"
              inputMode="decimal"
              value={draft.current_amount}
              onChange={(e) => setDraft((d) => ({ ...d, current_amount: e.target.value }))}
              className="w-full"
              preview={Number(draft.current_amount) > 0 ? formatKrwPreview(Number(draft.current_amount)) : undefined}
            />
          )}
          <Button type="submit" loading={submitting} className="mt-2">
            {submitLabel}
          </Button>
        </form>
      </Modal>
    );
  }

  if (isIrregular) {
    return (
      <Modal onClose={onClose} title={title}>
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
          <FormInput
            label="비정기 목표 이름"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full"
            required
          />
          <div>
            <label className={FORM_LABEL}>설명 (선택)</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              className={`w-full ${TEXTAREA_SM}`}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="시작일"
              type="date"
              value={draft.start_date}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  start_date: e.target.value,
                  monthly_targets: syncMonthlyTargetsToPeriod(e.target.value, d.target_date, d.monthly_targets),
                }))
              }
              className="w-full"
            />
            <FormInput
              label="종료일"
              type="date"
              value={draft.target_date}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  target_date: e.target.value,
                  monthly_targets: syncMonthlyTargetsToPeriod(d.start_date, e.target.value, d.monthly_targets),
                }))
              }
              className="w-full"
              min={draft.start_date}
            />
          </div>
          <GoalMonthlyTargetEditor
            mode="irregular"
            startMonth={toYearMonth(draft.start_date)}
            endMonth={toYearMonth(draft.target_date)}
            targets={draft.monthly_targets}
            onChange={(monthly_targets) => setDraft((d) => ({ ...d, monthly_targets }))}
          />
          {existingGoal && (
            <Button type="button" variant="secondary" size="sm" onClick={handleRedistributeShortfall}>
              부족분 재배분 제안
            </Button>
          )}
          <Button type="submit" loading={submitting} className="mt-2">
            {submitLabel}
          </Button>
        </form>
      </Modal>
    );
  }

  // 수정 모드에서 아직 아무것도 고치지 않았다면(초안이 저장된 값과 같다면) 백엔드가 이미 계산해
  // 내려준 months_remaining/suggested_monthly_amount(app/services/goal_service.py::
  // compute_months_remaining/compute_suggested_monthly_amount)를 그대로 보여준다. 목표일/나이/
  // 필요금액/현재저축액 중 하나라도 바뀌는 순간부터는 "저장하면 어떻게 될지" 미리보기가 필요하므로
  // 프론트에서 직접 계산한다 — 신규 생성 모드는 저장된 값 자체가 없어 항상 이 경로를 쓴다.
  const draftMatchesExistingGoal =
    existingGoal !== null &&
    draft.target_date === (existingGoal.target_date ?? "") &&
    draft.target_age === (existingGoal.target_age !== null ? String(existingGoal.target_age) : "") &&
    draft.required_amount === toAmountInputValue(existingGoal.required_amount) &&
    draft.current_amount === toAmountInputValue(existingGoal.current_amount);

  const monthsRemainingFromDate = draft.target_date !== "" ? monthsBetween(new Date(), new Date(draft.target_date)) : null;
  const monthsRemainingFromAge =
    currentAge !== "" && draft.target_age !== "" ? (Number(draft.target_age) - Number(currentAge)) * 12 : null;
  const monthsRemaining =
    draftMatchesExistingGoal && existingGoal
      ? existingGoal.months_remaining
      : (monthsRemainingFromDate ?? monthsRemainingFromAge);
  const suggestedMonthly =
    draftMatchesExistingGoal && existingGoal && existingGoal.suggested_monthly_amount !== null
      ? Math.round(Number(existingGoal.suggested_monthly_amount))
      : monthsRemaining !== null && monthsRemaining > 0
        ? Math.max(0, Math.round((Number(draft.required_amount) - Number(draft.current_amount)) / monthsRemaining))
        : null;

  // 장기목표의 "현재 진행액" — 연동이면 백엔드가 내려준 현재 잔액 합, 미연동이면 폼에 입력된 값.
  // 균등분배 버튼이 "필요금액 - 여기까지 모은 금액"을 남은 달에 나누는 기준이 된다.
  const currentProgressForDistribution =
    isLinked && existingGoal ? Number(existingGoal.current_amount) : Number(draft.current_amount) || 0;
  const hasMonthlyPlan = draft.monthly_targets.length > 0;

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
        {kindToggle}
        <p className={FORM_SECTION_LABEL}>기본 정보</p>
        {existingGoal === null ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            loading={growlioGoalMutation.isPending}
            onClick={() => growlioGoalMutation.mutate()}
          >
            growlio 투자목표 불러오기
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            loading={growlioGoalMutation.isPending}
            onClick={() => setConfirmingResync(true)}
          >
            growlio 값으로 새로고침
          </Button>
        )}
        {confirmingResync && (
          <ConfirmModal
            message="growlio에 설정된 최신 투자목표 값(목표금액·월납입액·연동 상품)으로 이 화면의 값을 덮어써요. 지금 입력한 값은 사라져요. 계속할까요?"
            confirmLabel="새로고침"
            danger={false}
            onConfirm={() => {
              setConfirmingResync(false);
              growlioGoalMutation.mutate();
            }}
            onCancel={() => setConfirmingResync(false)}
          />
        )}
        <FormInput
          label="재무목표"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label="순위"
            type="number"
            value={draft.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
            className="w-full"
          />
          <FormInput
            label="목표일 (두 분이 함께 정한 날짜)"
            type="date"
            value={draft.target_date}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                target_date: e.target.value,
                monthly_targets:
                  e.target.value === "" ? [] : syncMonthlyTargetsToPeriod(todayIso(), e.target.value, d.monthly_targets),
              }))
            }
            className="w-full"
          />
        </div>
        {draft.target_date === "" && (
          <FormInput
            label="필요한 나이 (목표일 대신 나이로 정할 때)"
            type="number"
            value={draft.target_age}
            onChange={(e) => setDraft((d) => ({ ...d, target_age: e.target.value }))}
            className="w-full"
          />
        )}
        <FormInput
          label="필요금액"
          type="number"
          inputMode="decimal"
          value={draft.required_amount}
          onChange={(e) => setDraft((d) => ({ ...d, required_amount: e.target.value }))}
          className="w-full"
          preview={Number(draft.required_amount) > 0 ? formatKrwPreview(Number(draft.required_amount)) : undefined}
        />
        <CollapsibleGroup
          header={<span className="text-sm font-medium text-gray-700 dark:text-gray-300">연동 항목</span>}
          amount={
            isLinked
              ? `${draft.savings_product_ids.length + draft.account_ids.length + draft.loan_ids.length}건 연동`
              : "연동 안 함"
          }
          defaultOpen={isLinked}
        >
          <FundingSourceChecklist
            label="연동할 저축/투자 상품 (복수 선택 가능)"
            items={availableSavingsProducts}
            getId={(p) => p.id}
            getName={(p) => p.name}
            getAmountLabel={(p) => formatKrw(p.current_balance)}
            selectedIds={draft.savings_product_ids}
            onToggle={(id) => toggleId("savings_product_ids", id)}
            emptyMessage="연동 가능한 저축/투자 상품이 없어요."
            hint="상품을 1개만 연동하면 그 상품의 월 계획액이 이 목표의 월 저축액으로 자동 설정되고
            저축상품 화면에서 직접 수정할 수 없어져요. 부부가 각자 다른 상품으로 함께 모을 때처럼
            여러 개를 연동하면 잔액은 합산되지만 월 계획액은 각 상품에서 계속 따로 입력해요.
            다른 목표에 이미 연동된 상품은 목록에 나오지 않아요."
          />
          <FundingSourceChecklist
            label="연동할 계좌 (복수 선택 가능)"
            items={accounts}
            getId={({ account }) => account.id}
            getName={({ account }) => account.name}
            getAmountLabel={({ balance }) => formatKrw(balance)}
            selectedIds={draft.account_ids}
            onToggle={(id) => toggleId("account_ids", id)}
            emptyMessage="등록된 계좌가 없어요."
          />
          <FundingSourceChecklist
            label="연동할 대출 (연동 시 금액에서 차감돼요)"
            items={loans}
            getId={(loan) => loan.id}
            getName={(loan) => loan.name}
            getAmountLabel={(loan) => `-${formatKrw(loan.balance)}`}
            amountClassName="text-red-500 dark:text-red-400"
            selectedIds={draft.loan_ids}
            onToggle={(id) => toggleId("loan_ids", id)}
            emptyMessage="등록된 대출이 없어요."
            hint="상품·계좌·대출을 연동하면 현재 저축액이 (연동된 상품·계좌 잔액 합) − (연동된 대출 잔액)으로
            자동 계산돼요. 부부가 각자 다른 상품/계좌로 한 목표를 함께 모을 때 여러 개를 선택하세요."
          />
        </CollapsibleGroup>
        <p className={FORM_SECTION_LABEL}>저축 계획</p>
        {isLinked ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
            현재 저축액은 연동된 항목들의 잔액 합(대출은 차감)으로 자동 계산돼요.
          </div>
        ) : hasMonthlyPlan ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
            현재 저축액은 아래 월별 계획의 달성액 합계로 자동 계산돼요. 저장한 뒤 목표 카드에서
            매달 저축액을 입력해 채워가세요.
          </div>
        ) : (
          <FormInput
            label="현재 저축액"
            type="number"
            inputMode="decimal"
            value={draft.current_amount}
            onChange={(e) => setDraft((d) => ({ ...d, current_amount: e.target.value }))}
            className="w-full"
            preview={Number(draft.current_amount) > 0 ? formatKrwPreview(Number(draft.current_amount)) : undefined}
          />
        )}
        {draft.target_date !== "" && (
          <GoalMonthlyTargetEditor
            mode="goal"
            startMonth={toYearMonth(todayIso())}
            endMonth={toYearMonth(draft.target_date)}
            targets={draft.monthly_targets}
            onChange={(monthly_targets) => setDraft((d) => ({ ...d, monthly_targets }))}
            distributeAmount={String(Math.max(0, Number(draft.required_amount) - currentProgressForDistribution))}
          />
        )}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">필요 저축액 자동 계산</p>
          {draft.target_date === "" && (
            <div className="flex items-end gap-2">
              <FormInput
                label="현재 나이"
                type="number"
                value={currentAge}
                onChange={(e) => setCurrentAge(e.target.value)}
                className="w-24"
              />
            </div>
          )}
          {suggestedMonthly !== null && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDraft((d) => ({ ...d, monthly_saving_amount: String(suggestedMonthly) }))}
            >
              제안 적용: 월 {formatKrw(suggestedMonthly)}
            </Button>
          )}
          {monthsRemaining !== null && monthsRemaining <= 0 && (
            <p className="text-xs text-red-500">목표일(또는 필요한 나이)이 지금보다 이후여야 계산할 수 있어요.</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            (필요금액 - 현재 저축액) ÷ 남은 개월 수로 월 저축금액을 제안해요. 저장되지 않고 계산에만 쓰여요.
          </p>
        </div>
        {existingGoal &&
          existingGoal.weighted_return_rate_pct !== null &&
          existingGoal.projected_months_with_growth !== null && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 space-y-1">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                투자수익률 반영 예상 소요기간 (가정치)
              </p>
              <p className="text-sm text-gray-900 dark:text-gray-50">
                연동 투자상품 수익률 {formatPercent(Number(existingGoal.weighted_return_rate_pct))} 가정 시 약{" "}
                {existingGoal.projected_months_with_growth}개월 후 목표 달성 예상
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                원금 대비 현재 손익률을 연 수익률처럼 가정한 값이라 보유기간에 따라 실제와 다를 수 있어요 —
                참고용 추정치예요.
              </p>
            </div>
          )}
        <FormInput
          label="월 저축금액"
          type="number"
          inputMode="decimal"
          value={draft.monthly_saving_amount}
          onChange={(e) => setDraft((d) => ({ ...d, monthly_saving_amount: e.target.value }))}
          className="w-full"
          preview={
            Number(draft.monthly_saving_amount) > 0 ? formatKrwPreview(Number(draft.monthly_saving_amount)) : undefined
          }
        />
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
