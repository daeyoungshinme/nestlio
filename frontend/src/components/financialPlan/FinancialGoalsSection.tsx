import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import ProgressBar from "@/components/common/ProgressBar";
import SkeletonCard from "@/components/common/SkeletonCard";
import { fetchDashboard } from "@/api/dashboard";
import { createGoal, deleteGoal, fetchGoals, updateGoal } from "@/api/goals";
import { fetchSettings, setEmergencyFund } from "@/api/settings";
import { INLINE_BUTTON_OFFSET } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { insightSeverityStyle } from "@/utils/colors";
import { formatKrw, formatKrwPreview, formatPercent, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { FinancialGoalOut } from "@/types";

interface Draft {
  priority: string;
  name: string;
  target_age: string;
  required_amount: string;
  monthly_saving_amount: string;
  current_amount: string;
}

const EMPTY_DRAFT: Draft = {
  priority: "1",
  name: "",
  target_age: "",
  required_amount: "0",
  monthly_saving_amount: "0",
  current_amount: "0",
};

function draftFromGoal(goal: FinancialGoalOut): Draft {
  return {
    priority: String(goal.priority),
    name: goal.name,
    target_age: goal.target_age !== null ? String(goal.target_age) : "",
    required_amount: toAmountInputValue(goal.required_amount),
    monthly_saving_amount: toAmountInputValue(goal.monthly_saving_amount),
    current_amount: toAmountInputValue(goal.current_amount),
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
  const { data: settingsData } = useQuery({ queryKey: QUERY_KEYS.settings, queryFn: fetchSettings });
  const { data: dashboard } = useQuery({
    queryKey: QUERY_KEYS.dashboard("month"),
    queryFn: () => fetchDashboard("month"),
    staleTime: STALE_TIME.SHORT,
  });

  const saveFundMutation = useMutation({
    mutationFn: setEmergencyFund,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast("비상금 잔액이 저장되었습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.financialGoals });

  const createMutation = useMutation({
    mutationFn: createGoal,
    onSuccess: () => {
      void invalidate();
      setFormTarget(null);
      toast("재무목표를 추가했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Parameters<typeof updateGoal>[1]) => updateGoal(id, payload),
    onSuccess: () => {
      void invalidate();
      setFormTarget(null);
      toast("저장했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () => {
      void invalidate();
      setDeleteTarget(null);
      toast("삭제했습니다.", "success");
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
        { id: formTarget.id, ...toPayload(draft) },
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
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{goal.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {formatKrw(goal.current_amount)} / {formatKrw(goal.required_amount)} · 월 {formatKrw(goal.monthly_saving_amount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setFormTarget(goal)}
                      className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors`}
                      aria-label="수정"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(goal.id)}
                      className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors`}
                      aria-label="삭제"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
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
  onClose,
  onSubmit,
}: {
  initial: Draft;
  title: string;
  submitLabel: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit(draft);
  };

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
        <FormInput
          label="현재 저축액"
          type="number"
          inputMode="decimal"
          value={draft.current_amount}
          onChange={(e) => setDraft((d) => ({ ...d, current_amount: e.target.value }))}
          className="w-full"
          preview={Number(draft.current_amount) > 0 ? formatKrwPreview(Number(draft.current_amount)) : undefined}
        />
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
