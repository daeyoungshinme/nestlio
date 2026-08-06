import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import ProgressBar from "@/components/common/ProgressBar";
import RowActionButtons from "@/components/common/RowActionButtons";
import SkeletonCard from "@/components/common/SkeletonCard";
import { fetchDashboard } from "@/api/dashboard";
import { createGoal, deleteGoal, fetchGoals, updateGoal } from "@/api/goals";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { fetchSettings, setEmergencyFund } from "@/api/settings";
import { FORM_LABEL, INLINE_BUTTON_OFFSET } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { insightSeverityStyle } from "@/utils/colors";
import { formatKrw, formatKrwPreview, formatPercent, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { FinancialGoalOut, SavingsProductOut } from "@/types";

interface Draft {
  priority: string;
  name: string;
  target_age: string;
  required_amount: string;
  monthly_saving_amount: string;
  current_amount: string;
  savings_product_ids: string[];
}

const EMPTY_DRAFT: Draft = {
  priority: "1",
  name: "",
  target_age: "",
  required_amount: "0",
  monthly_saving_amount: "0",
  current_amount: "0",
  savings_product_ids: [],
};

function draftFromGoal(goal: FinancialGoalOut): Draft {
  return {
    priority: String(goal.priority),
    name: goal.name,
    target_age: goal.target_age !== null ? String(goal.target_age) : "",
    required_amount: toAmountInputValue(goal.required_amount),
    monthly_saving_amount: toAmountInputValue(goal.monthly_saving_amount),
    current_amount: toAmountInputValue(goal.current_amount),
    savings_product_ids: goal.funding_source_ids.map(String),
  };
}

function toPayload(draft: Draft) {
  return {
    priority: Number(draft.priority) || 1,
    name: draft.name,
    target_age: draft.target_age === "" ? null : Number(draft.target_age),
    required_amount: draft.required_amount,
    monthly_saving_amount: draft.monthly_saving_amount,
    current_amount: draft.current_amount,
    savings_product_ids: draft.savings_product_ids.map(Number),
  };
}

const GOAL_MILESTONES = [25, 50, 75, 100];

/** 저장 전후 진행률을 비교해 이번 저장으로 새로 넘어선 가장 높은 마일스톤을 반환한다 (없으면 null). */
function crossedMilestone(oldPct: number, newPct: number): number | null {
  const crossed = GOAL_MILESTONES.filter((m) => oldPct < m && newPct >= m);
  return crossed.length > 0 ? Math.max(...crossed) : null;
}

export default function FinancialGoalsSection() {
  const [formTarget, setFormTarget] = useState<"new" | FinancialGoalOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [emergencyFundDraft, setEmergencyFundDraft] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.financialGoals, queryFn: fetchGoals });
  const { data: savingsProducts } = useQuery({
    queryKey: QUERY_KEYS.savingsProducts,
    queryFn: fetchSavingsProducts,
    staleTime: STALE_TIME.MEDIUM,
  });
  const { data: settingsData } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: fetchSettings,
    staleTime: STALE_TIME.MEDIUM,
  });
  const { data: dashboard } = useQuery({
    queryKey: QUERY_KEYS.dashboard("month"),
    queryFn: () => fetchDashboard("month"),
    staleTime: STALE_TIME.SHORT,
  });

  const saveFundMutation = useMutation({
    mutationFn: setEmergencyFund,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      toast("비상금 잔액이 저장되었습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
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

  const fundValue =
    emergencyFundDraft ??
    (settingsData?.emergency_fund_balance ? toAmountInputValue(settingsData.emergency_fund_balance) : "");

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">비상금</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          부부가 함께 모아둔 비상금 잔액이에요. 대시보드 코칭에서 고정지출 대비 몇 개월치인지 알려드려요.
        </p>
        <div className="flex items-start flex-wrap gap-3">
          <FormInput
            label="비상금 잔액"
            type="number"
            inputMode="decimal"
            value={fundValue}
            onChange={(e) => setEmergencyFundDraft(e.target.value)}
            className="w-full sm:w-40"
            preview={Number(fundValue) > 0 ? formatKrwPreview(Number(fundValue)) : undefined}
          />
          <Button
            size="sm"
            loading={saveFundMutation.isPending}
            onClick={() => saveFundMutation.mutate(fundValue)}
            className={`${INLINE_BUTTON_OFFSET} min-h-[44px]`}
          >
            저장
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
          목표 추가
        </Button>
      </div>

      {data.length === 0 ? (
        <EmptyState title="등록된 재무목표가 없어요" description="위 버튼으로 첫 재무목표를 세워보세요" compact />
      ) : (
        <div className="space-y-2">
          {data
            .slice()
            .sort((a, b) => a.priority - b.priority)
            .map((goal) => (
              <div key={goal.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {goal.priority}순위{goal.target_age !== null ? ` · ${goal.target_age}세까지` : ""}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{goal.name}</p>
                      {goal.funding_source_names.length > 0 && (
                        <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          <Link2 size={11} />
                          {goal.funding_source_names.join(", ")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {goal.funding_source_names.length > 0 ? "연동 상품 잔액 합계" : "현재 저축액"}{" "}
                      {formatKrw(goal.current_amount)} / 목표 {formatKrw(goal.required_amount)} · 월{" "}
                      {formatKrw(goal.monthly_saving_amount)}
                    </p>
                  </div>
                  <RowActionButtons onEdit={() => setFormTarget(goal)} onDelete={() => setDeleteTarget(goal.id)} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <ProgressBar pct={Number(goal.progress_pct)} />
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {formatPercent(Number(goal.progress_pct))} 달성
                  </span>
                </div>
              </div>
            ))}
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

      {formTarget && (
        <GoalFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromGoal(formTarget)}
          title={formTarget === "new" ? "재무목표 추가" : "재무목표 수정"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={isSaving}
          savingsProducts={savingsProducts ?? []}
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
  onClose,
  onSubmit,
}: {
  initial: Draft;
  title: string;
  submitLabel: string;
  submitting: boolean;
  savingsProducts: SavingsProductOut[];
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [currentAge, setCurrentAge] = useState("");
  const isLinked = draft.savings_product_ids.length > 0;

  const toggleProduct = (id: string) => {
    setDraft((d) => ({
      ...d,
      savings_product_ids: d.savings_product_ids.includes(id)
        ? d.savings_product_ids.filter((pid) => pid !== id)
        : [...d.savings_product_ids, id],
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit(draft);
  };

  const monthsRemaining =
    currentAge !== "" && draft.target_age !== "" ? (Number(draft.target_age) - Number(currentAge)) * 12 : null;
  const suggestedMonthly =
    monthsRemaining !== null && monthsRemaining > 0
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
            label="필요한 나이"
            type="number"
            value={draft.target_age}
            onChange={(e) => setDraft((d) => ({ ...d, target_age: e.target.value }))}
            className="w-full"
          />
        </div>
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
                      onChange={() => toggleProduct(String(p.id))}
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
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            상품을 연동하면 현재 저축액이 연동된 상품들의 잔액 합으로 자동 계산돼요. 부부가 각자 다른
            상품으로 한 목표를 함께 모을 때 여러 개를 선택하세요.
          </p>
        </div>
        {isLinked ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
            현재 저축액은 연동된 상품들의 잔액 합으로 자동 계산돼요.
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
          <div className="flex items-end gap-2">
            <FormInput
              label="현재 나이"
              type="number"
              value={currentAge}
              onChange={(e) => setCurrentAge(e.target.value)}
              className="w-24"
            />
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
          </div>
          {currentAge !== "" && draft.target_age !== "" && monthsRemaining !== null && monthsRemaining <= 0 && (
            <p className="text-xs text-red-500">필요한 나이가 현재 나이보다 이후여야 계산할 수 있어요.</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            (필요금액 - 현재 저축액) ÷ 남은 개월 수로 월 저축금액을 제안해요. 저장되지 않고 계산에만 쓰여요.
          </p>
        </div>
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
