import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, Plus, Target, Trophy } from "lucide-react";
import AnnualSavingsGoalCard from "@/components/financialPlan/AnnualSavingsGoalCard";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import FundingSourceChecklist from "@/components/financialPlan/FundingSourceChecklist";
import GoalProgressCard from "@/components/financialPlan/GoalProgressCard";
import type { GoalProgressCardBadge, GoalProgressCardExtraDetail } from "@/components/financialPlan/GoalProgressCard";
import GoalSectionHeader from "@/components/financialPlan/GoalSectionHeader";
import Modal from "@/components/common/Modal";
import SkeletonCard from "@/components/common/SkeletonCard";
import Tabs from "@/components/common/Tabs";
import { currentYearMonth } from "@/components/common/MonthPicker";
import { fetchAccounts } from "@/api/accounts";
import { fetchDashboard } from "@/api/dashboard";
import { createGoal, deleteGoal, fetchGoals, fetchGrowlioGoalSettings, updateGoal } from "@/api/goals";
import { fetchLoans } from "@/api/loans";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { FORM_LABEL, FORM_SECTION_LABEL, INLINE_BUTTON_OFFSET, TEXTAREA_SM } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { insightSeverityStyle, progressStatusBadgeClass, progressStatusLabel } from "@/utils/colors";
import { computeCardStatus, computeGoalStatus, daysUntil, isGoalAchieved } from "@/utils/goalStatus";
import { GOAL_SORT_LABELS, sortGoals, type GoalSortLabel } from "@/utils/goalSort";
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
};

const EMPTY_CHALLENGE_DRAFT: Draft = {
  ...EMPTY_GOAL_DRAFT,
  kind: "challenge",
  start_date: todayIso(),
  target_date: todayIso(),
};

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
  };
}

function toPayload(draft: Draft) {
  const isChallenge = draft.kind === "challenge";
  const funding_sources: FundingSourceIn[] = isChallenge
    ? []
    : [
        ...draft.savings_product_ids.map((id) => ({ type: "savings_product" as const, id: Number(id) })),
        ...draft.account_ids.map((id) => ({ type: "account" as const, id: Number(id) })),
        ...draft.loan_ids.map((id) => ({ type: "loan" as const, id: Number(id) })),
      ];
  return {
    kind: draft.kind,
    priority: Number(draft.priority) || 1,
    name: draft.name,
    description: isChallenge && draft.description.trim() !== "" ? draft.description : null,
    target_age: isChallenge || draft.target_age === "" ? null : Number(draft.target_age),
    target_date: draft.target_date === "" ? null : draft.target_date,
    required_amount: draft.required_amount,
    monthly_saving_amount: isChallenge ? "0" : draft.monthly_saving_amount,
    current_amount: draft.current_amount,
    funding_sources,
    start_date: isChallenge ? draft.start_date : null,
  };
}

const GOAL_MILESTONES = [25, 50, 75, 100];

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

export default function FinancialGoalsSection() {
  const [formTarget, setFormTarget] = useState<"new-goal" | "new-challenge" | FinancialGoalOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [sortOption, setSortOption] = useState<GoalSortLabel>("우선순위순");
  const [progressDraft, setProgressDraft] = useState<Record<number, string>>({});

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
  const { data: dashboard } = useQuery({
    queryKey: QUERY_KEYS.dashboard("month", currentYearMonth()),
    queryFn: () => fetchDashboard("month", currentYearMonth()),
    staleTime: STALE_TIME.SHORT,
  });

  const { createMutation, updateMutation, removeMutation: deleteMutation, invalidate } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.financialGoals],
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

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  const totalRequired = data.reduce((sum, g) => sum + Number(g.required_amount), 0);
  const totalMonthly = data.reduce((sum, g) => sum + Number(g.monthly_saving_amount), 0);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const goalPaceInsight = dashboard?.insights.find((i) => i.rule_code === "goal_pace");
  const investableSurplus = dashboard?.investable_surplus ?? "0";
  const priorityOrderedGoals = data.slice().sort((a, b) => a.priority - b.priority);
  // 달성한 목표는 활성 목록에서 분리해 아래 접이식으로 옮긴다 — 완료된 항목이 계속 쌓여
  // 목록을 채우는 것을 막기 위함(백엔드에 별도 archive 필드는 없음, 순수 프론트 판정).
  const activeGoalsByPriority = priorityOrderedGoals.filter((g) => !isGoalAchieved(g));
  const achievedGoals = priorityOrderedGoals.filter((g) => isGoalAchieved(g));
  const activeGoals = sortGoals(activeGoalsByPriority, sortOption);
  // 여유자금은 가계 전체 단위라 목표마다 반복 표시하면 목표별로 다른 금액처럼 오인될 수 있어,
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
    if (formTarget === "new-goal" || formTarget === "new-challenge") {
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

  /** 활성/달성 목표 목록이 공유하는 카드 조립. 챌린지(kind="challenge")는 재무목표와 필드
   * 구성이 크게 달라(연동/growlio/투자수익률 예측이 없고, 대신 기간·진행금액 인라인 갱신이
   * 있음) 별도 분기로 렌더링하되 같은 GoalProgressCard·같은 우선순위 정렬 목록을 공유한다. */
  const renderGoalCard = (goal: FinancialGoalOut) => {
    if (goal.kind === "challenge") {
      const draftValue = progressDraft[goal.id] ?? toAmountInputValue(goal.current_amount);
      const isActive = goal.effective_status === "active";
      const status = computeCardStatus(goal);
      const badges: GoalProgressCardBadge[] = [
        { label: progressStatusLabel(status), toneClassName: progressStatusBadgeClass(status) },
        { label: "챌린지", toneClassName: progressStatusBadgeClass("neutral") },
      ];
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
          onEdit={() => setFormTarget(goal)}
          onDelete={() => setDeleteTarget(goal.id)}
          footer={
            isActive && (
              <div className="flex items-start flex-wrap gap-2 pt-1">
                <FormInput
                  label="진행 금액 갱신"
                  type="number"
                  inputMode="decimal"
                  value={draftValue}
                  onChange={(e) => setProgressDraft((d) => ({ ...d, [goal.id]: e.target.value }))}
                  className="w-full sm:w-40"
                  preview={Number(draftValue) > 0 ? formatKrwPreview(Number(draftValue)) : undefined}
                />
                <Button
                  size="sm"
                  loading={progressMutation.isPending && progressMutation.variables?.id === goal.id}
                  onClick={() => handleUpdateProgress(goal, draftValue)}
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

    const growlioAccountId = findGrowlioInvestmentLink(goal, savingsProducts ?? []);
    const showSurplusHint =
      goal.id === firstGrowlioLinkedGoalId && GROWLIO_APP_URL && Number(investableSurplus) > 0;
    const hasLoanSource = goal.funding_sources.some((fs) => fs.type === "loan");
    const status = computeGoalStatus(goal);

    const badges: GoalProgressCardBadge[] = [
      { label: progressStatusLabel(status), toneClassName: progressStatusBadgeClass(status) },
    ];

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
          <div className="space-y-0.5">
            {goal.funding_sources.map((fs) => (
              <div key={`${fs.type}-${fs.id}`} className="flex items-center justify-between gap-2">
                <span className="truncate">{fs.name}</span>
                <span className="shrink-0">{formatKrw(fs.amount)}</span>
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
        pct={Number(goal.progress_pct)}
        primaryDetail={
          <>
            {goal.funding_sources.length > 0 ? "연동 항목 잔액 합계" : "현재 저축액"}{" "}
            {formatKrw(goal.current_amount)} / 목표 {formatKrw(goal.required_amount)} · 월{" "}
            {formatKrw(goal.monthly_saving_amount)}
            {hasLoanSource && " (대출 차감 반영)"}
          </>
        }
        pinnedDetail={growlioDetail}
        extraDetails={extraDetails}
        onEdit={() => setFormTarget(goal)}
        onDelete={() => setDeleteTarget(goal.id)}
      />
    );
  };

  const modalInitial =
    formTarget === "new-goal"
      ? EMPTY_GOAL_DRAFT
      : formTarget === "new-challenge"
        ? EMPTY_CHALLENGE_DRAFT
        : formTarget !== null
          ? draftFromGoal(formTarget)
          : null;
  const modalTitle =
    formTarget === "new-goal"
      ? "재무목표 추가"
      : formTarget === "new-challenge"
        ? "챌린지 추가"
        : formTarget !== null && formTarget.kind === "challenge"
          ? "챌린지 수정"
          : "재무목표 수정";

  return (
    <div className="space-y-6">
      <AnnualSavingsGoalCard />

      <GoalSectionHeader
        title="재무목표"
        description="구체적인 용도별 저축 목표와, 기간을 정해 부부가 함께 짧게 도전하는 챌린지를 함께 관리해요. 저축·투자 상품이나 계좌를 연동하면 잔액이 자동으로 반영돼요."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={<Trophy size={14} />} onClick={() => setFormTarget("new-challenge")}>
              챌린지 추가
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

          {goalPaceInsight && (
            <div className={`border rounded-lg px-3 py-2 text-xs ${insightSeverityStyle(goalPaceInsight.severity)}`}>
              {goalPaceInsight.message}
            </div>
          )}

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
          submitLabel={formTarget === "new-goal" || formTarget === "new-challenge" ? "추가" : "저장"}
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
  const isLinked =
    draft.savings_product_ids.length > 0 || draft.account_ids.length > 0 || draft.loan_ids.length > 0;

  const growlioGoalMutation = useMutation({
    mutationFn: fetchGrowlioGoalSettings,
    onSuccess: (data) => {
      if (!data.is_configured || data.goal_amount === null) {
        toast("growlio에 설정된 투자목표가 없어요.", "error");
        return;
      }
      const growlioProductIds = savingsProducts.filter(isGrowlioLinkedInvestment).map((p) => String(p.id));
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

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
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
            onChange={(e) => setDraft((d) => ({ ...d, target_date: e.target.value }))}
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
            items={savingsProducts}
            getId={(p) => p.id}
            getName={(p) => p.name}
            getAmountLabel={(p) => formatKrw(p.current_balance)}
            selectedIds={draft.savings_product_ids}
            onToggle={(id) => toggleId("savings_product_ids", id)}
            emptyMessage="등록된 저축/투자 상품이 없어요."
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
