import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Link2, Plus, Target } from "lucide-react";
import AnnualSavingsGoalCard from "@/components/financialPlan/AnnualSavingsGoalCard";
import Button from "@/components/common/Button";
import ChallengesSection from "@/components/financialPlan/ChallengesSection";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import GoalProgressCard from "@/components/financialPlan/GoalProgressCard";
import type { GoalProgressCardBadge, GoalProgressCardExtraDetail } from "@/components/financialPlan/GoalProgressCard";
import GoalSectionHeader from "@/components/financialPlan/GoalSectionHeader";
import Modal from "@/components/common/Modal";
import SkeletonCard from "@/components/common/SkeletonCard";
import { currentYearMonth } from "@/components/common/MonthPicker";
import { fetchAccounts } from "@/api/accounts";
import { fetchDashboard } from "@/api/dashboard";
import { createGoal, deleteGoal, fetchGoals, updateGoal } from "@/api/goals";
import { fetchLoans } from "@/api/loans";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { FORM_LABEL } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { fundingLinkBadgeStyle, insightSeverityStyle, progressStatusBadgeClass, progressStatusLabel } from "@/utils/colors";
import { computeGoalStatus, daysUntil } from "@/utils/goalStatus";
import { formatKrw, formatKrwPreview, formatPercent, toAmountInputValue } from "@/utils/format";
import { toast } from "@/utils/toast";
import { GROWLIO_APP_URL, growlioPortfolioUrl, isGrowlioLinkedInvestment } from "@/constants/growlio";
import type { AccountWithBalanceOut, FinancialGoalOut, FundingSourceIn, LoanOut, SavingsProductOut } from "@/types";

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

interface Draft {
  priority: string;
  name: string;
  target_age: string;
  target_date: string;
  required_amount: string;
  monthly_saving_amount: string;
  current_amount: string;
  savings_product_ids: string[];
  account_ids: string[];
  loan_ids: string[];
}

const EMPTY_DRAFT: Draft = {
  priority: "1",
  name: "",
  target_age: "",
  target_date: "",
  required_amount: "0",
  monthly_saving_amount: "0",
  current_amount: "0",
  savings_product_ids: [],
  account_ids: [],
  loan_ids: [],
};

function draftFromGoal(goal: FinancialGoalOut): Draft {
  return {
    priority: String(goal.priority),
    name: goal.name,
    target_age: goal.target_age !== null ? String(goal.target_age) : "",
    target_date: goal.target_date ?? "",
    required_amount: toAmountInputValue(goal.required_amount),
    monthly_saving_amount: toAmountInputValue(goal.monthly_saving_amount),
    current_amount: toAmountInputValue(goal.current_amount),
    savings_product_ids: goal.funding_sources.filter((fs) => fs.type === "savings_product").map((fs) => String(fs.id)),
    account_ids: goal.funding_sources.filter((fs) => fs.type === "account").map((fs) => String(fs.id)),
    loan_ids: goal.funding_sources.filter((fs) => fs.type === "loan").map((fs) => String(fs.id)),
  };
}

function toPayload(draft: Draft) {
  const funding_sources: FundingSourceIn[] = [
    ...draft.savings_product_ids.map((id) => ({ type: "savings_product" as const, id: Number(id) })),
    ...draft.account_ids.map((id) => ({ type: "account" as const, id: Number(id) })),
    ...draft.loan_ids.map((id) => ({ type: "loan" as const, id: Number(id) })),
  ];
  return {
    priority: Number(draft.priority) || 1,
    name: draft.name,
    target_age: draft.target_age === "" ? null : Number(draft.target_age),
    target_date: draft.target_date === "" ? null : draft.target_date,
    required_amount: draft.required_amount,
    monthly_saving_amount: draft.monthly_saving_amount,
    current_amount: draft.current_amount,
    funding_sources,
  };
}

const GOAL_MILESTONES = [25, 50, 75, 100];

/** 저장 전후 진행률을 비교해 이번 저장으로 새로 넘어선 가장 높은 마일스톤을 반환한다 (없으면 null). */
function crossedMilestone(oldPct: number, newPct: number): number | null {
  const crossed = GOAL_MILESTONES.filter((m) => oldPct < m && newPct >= m);
  return crossed.length > 0 ? Math.max(...crossed) : null;
}

/** start~end 사이 전체 개월 수 — 백엔드 app/utils/dates.py::months_between과 동일한 규칙(일 차이는 무시). */
function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

export default function FinancialGoalsSection() {
  const [formTarget, setFormTarget] = useState<"new" | FinancialGoalOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

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

  const { createMutation, updateMutation, removeMutation: deleteMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.financialGoals],
    api: { create: createGoal, update: updateGoal, remove: deleteGoal },
    messages: { create: "재무목표를 추가했습니다.", update: "저장했습니다.", remove: "삭제했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeleteTarget(null),
  });

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  const totalRequired = data.reduce((sum, g) => sum + Number(g.required_amount), 0);
  const totalMonthly = data.reduce((sum, g) => sum + Number(g.monthly_saving_amount), 0);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const goalPaceInsight = dashboard?.insights.find((i) => i.rule_code === "goal_pace");
  const investableSurplus = dashboard?.investable_surplus ?? "0";
  const sortedGoals = data.slice().sort((a, b) => a.priority - b.priority);
  // 여유자금은 가계 전체 단위라 목표마다 반복 표시하면 목표별로 다른 금액처럼 오인될 수 있어,
  // growlio 연동된 목표 중 우선순위가 가장 높은 하나에만 붙인다.
  const firstGrowlioLinkedGoalId =
    sortedGoals.find((g) => findGrowlioInvestmentLink(g, savingsProducts ?? []))?.id ?? null;

  const celebrateIfCrossed = (oldPct: number, goal: FinancialGoalOut) => {
    const milestone = crossedMilestone(oldPct, Number(goal.progress_pct));
    if (milestone !== null) {
      toast(`"${goal.name}" 목표 ${milestone}% 달성! 축하해요 🎉`, "success");
    }
  };

  const handleSubmit = (draft: Draft) => {
    const oldPct = formTarget !== "new" && formTarget ? Number(formTarget.progress_pct) : 0;
    if (formTarget === "new") {
      createMutation.mutate(toPayload(draft), { onSuccess: (goal) => celebrateIfCrossed(oldPct, goal) });
    } else if (formTarget) {
      updateMutation.mutate(
        { id: formTarget.id, payload: toPayload(draft) },
        { onSuccess: (goal) => celebrateIfCrossed(oldPct, goal) },
      );
    }
  };

  return (
    <div className="space-y-6">
      <GoalSectionHeader
        title="가구 저축 페이스"
        description="부부가 함께 정한 연도별 순저축 목표 대비 이번 해/이번 달 진행 상황이에요."
      />
      <AnnualSavingsGoalCard />

      <GoalSectionHeader
        title="재무목표"
        description="구체적인 용도별 저축 목표예요. 저축·투자 상품이나 계좌를 연동하면 잔액이 자동으로 반영돼요."
        action={
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
            목표 추가
          </Button>
        }
      />

      {data.length === 0 ? (
        <EmptyState
          icon={Target}
          title="등록된 재무목표가 없어요"
          description="위 버튼으로 첫 재무목표를 세워보세요"
          compact
        />
      ) : (
        <div className="space-y-2">
          {sortedGoals.map((goal) => {
            const growlioAccountId = findGrowlioInvestmentLink(goal, savingsProducts ?? []);
            const showSurplusHint =
              goal.id === firstGrowlioLinkedGoalId && GROWLIO_APP_URL && Number(investableSurplus) > 0;
            const hasLoanSource = goal.funding_sources.some((fs) => fs.type === "loan");
            const status = computeGoalStatus(goal);

            const badges: GoalProgressCardBadge[] = [
              { label: progressStatusLabel(status), toneClassName: progressStatusBadgeClass(status) },
            ];
            if (goal.funding_sources.length > 0) {
              badges.push({
                label: goal.funding_sources.map((fs) => fs.name).join(", "),
                toneClassName: fundingLinkBadgeStyle(),
                icon: <Link2 size={11} />,
              });
            }

            const extraDetails: GoalProgressCardExtraDetail[] = [];
            if (growlioAccountId && GROWLIO_APP_URL) {
              extraDetails.push({
                key: "growlio",
                content: (
                  <a
                    href={growlioPortfolioUrl(growlioAccountId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <ExternalLink size={12} />
                    이 목표의 투자금, growlio에서 포트폴리오로 굴리기
                  </a>
                ),
              });
            }
            if (showSurplusHint) {
              extraDetails.push({
                key: "surplus",
                content: `이번 달 여유자금 ${formatKrw(investableSurplus)}, 이 목표의 투자금에 보태보세요.`,
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
                }`}
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
                extraDetails={extraDetails}
                onEdit={() => setFormTarget(goal)}
                onDelete={() => setDeleteTarget(goal.id)}
              />
            );
          })}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-1 sm:gap-6 pt-1 text-sm font-semibold text-gray-900 dark:text-gray-50">
            <span className="sm:text-right">필요금액 합계 {formatKrw(totalRequired)}</span>
            <span className="sm:text-right">월 저축금액 합계 {formatKrw(totalMonthly)}</span>
          </div>
          {goalPaceInsight && (
            <div className={`border rounded-lg px-3 py-2 text-xs ${insightSeverityStyle(goalPaceInsight.severity)}`}>
              {goalPaceInsight.message}
            </div>
          )}
        </div>
      )}

      <GoalSectionHeader
        title="부부 챌린지"
        description="기간을 정해두고 부부가 함께 짧게 도전하는 미니 목표예요. 장기 목표와 별개로 자유롭게 만들어보세요."
      />
      <ChallengesSection />

      {formTarget && (
        <GoalFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromGoal(formTarget)}
          title={formTarget === "new" ? "재무목표 추가" : "재무목표 수정"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={isSaving}
          savingsProducts={savingsProducts ?? []}
          accounts={accounts ?? []}
          loans={loans ?? []}
          existingGoal={formTarget === "new" ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deleteTarget !== null && (
        <ConfirmModal
          message="이 재무목표를 삭제할까요?"
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
  const isLinked =
    draft.savings_product_ids.length > 0 || draft.account_ids.length > 0 || draft.loan_ids.length > 0;

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
        <div>
          <label className={FORM_LABEL}>연동할 저축/투자 상품 (복수 선택 가능)</label>
          {savingsProducts.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">등록된 저축/투자 상품이 없어요.</p>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-40 overflow-y-auto">
              {savingsProducts.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={draft.savings_product_ids.includes(String(p.id))}
                      onChange={() => toggleId("savings_product_ids", String(p.id))}
                      className="h-4 w-4 rounded border-gray-300 shrink-0"
                    />
                    <span className="truncate text-gray-900 dark:text-gray-50">{p.name}</span>
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {formatKrw(p.current_balance)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className={FORM_LABEL}>연동할 계좌 (복수 선택 가능)</label>
          {accounts.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">등록된 계좌가 없어요.</p>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-40 overflow-y-auto">
              {accounts.map(({ account, balance }) => (
                <label
                  key={account.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={draft.account_ids.includes(String(account.id))}
                      onChange={() => toggleId("account_ids", String(account.id))}
                      className="h-4 w-4 rounded border-gray-300 shrink-0"
                    />
                    <span className="truncate text-gray-900 dark:text-gray-50">{account.name}</span>
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{formatKrw(balance)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className={FORM_LABEL}>연동할 대출 (연동 시 금액에서 차감돼요)</label>
          {loans.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">등록된 대출이 없어요.</p>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 max-h-40 overflow-y-auto">
              {loans.map((loan) => (
                <label
                  key={loan.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={draft.loan_ids.includes(String(loan.id))}
                      onChange={() => toggleId("loan_ids", String(loan.id))}
                      className="h-4 w-4 rounded border-gray-300 shrink-0"
                    />
                    <span className="truncate text-gray-900 dark:text-gray-50">{loan.name}</span>
                  </span>
                  <span className="text-xs text-red-500 dark:text-red-400 shrink-0">-{formatKrw(loan.balance)}</span>
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            상품·계좌·대출을 연동하면 현재 저축액이 (연동된 상품·계좌 잔액 합) − (연동된 대출 잔액)으로
            자동 계산돼요. 부부가 각자 다른 상품/계좌로 한 목표를 함께 모을 때 여러 개를 선택하세요.
          </p>
        </div>
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
