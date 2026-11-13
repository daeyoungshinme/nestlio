import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import Modal from "@/components/common/Modal";
import SkeletonCard from "@/components/common/SkeletonCard";
import StatusBadge from "@/components/common/StatusBadge";
import SavingsProductAnnualPlanForm from "@/components/financialPlan/SavingsProductAnnualPlanForm";
import SuggestionHint from "@/components/financialPlan/SuggestionHint";
import type { NormalizedItem } from "@/components/financialPlan/savingsPlanItems";
import { fetchSavingsProductAnnualPlanDetail, upsertSavingsProductAnnualPlan } from "@/api/savingsProducts";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { invalidateKeys } from "@/utils/queryClient";
import { formatKrw, formatPercent } from "@/utils/format";
import {
  linkedGoalBadgeStyle,
  planStatusTextClass,
  savingsProductTypeBadgeStyle,
  savingsProductTypeLabel,
} from "@/utils/colors";
import { toast } from "@/utils/toast";
import type { SavingsProductOut, UserOut } from "@/types";

/** 저축·투자 상품 한 줄 — 계획 대비 실적, 월별 계획 편집 모달, 최근 3개월 평균 제안 반영. */
export default function SavingsPlanProductRow({
  item,
  product,
  users,
  yearMonth,
  year,
}: {
  item: NormalizedItem;
  product?: SavingsProductOut;
  users: UserOut[] | undefined;
  yearMonth: string;
  year: number;
}) {
  const ownerLabel = product?.owner_user_id
    ? (users?.find((u) => u.id === product.owner_user_id)?.display_name ?? "공통")
    : "공통";

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const invalidate = () => {
    invalidateKeys(queryClient, [
      // savingsProducts는 계획·연간계획·상품별 연간계획 캐시의 공통 프리픽스라 이 하나로 전부 무효화된다.
      QUERY_KEYS.savingsProducts,
      QUERY_KEYS.dashboardBootstrap,
      // 목표의 계획 월액·예상 달성월(planned_monthly_amount/eta)과 홈의 목표 페이스 코칭이 상품 월 계획을 원본으로 쓴다.
      QUERY_KEYS.financialGoals,
      QUERY_KEYS.dashboardAll,
    ]);
  };

  const { data: planDetail, isLoading: isPlanLoading } = useQuery({
    queryKey: QUERY_KEYS.savingsProductAnnualPlanDetail(item.id, year),
    queryFn: () => fetchSavingsProductAnnualPlanDetail(item.id, year),
    enabled: isPlanModalOpen,
  });

  const upsertPlanMutation = useMutation({
    mutationFn: (values: { start_month: string; end_month: string; monthly_targets: { year_month: string; target_amount: string }[] }) =>
      upsertSavingsProductAnnualPlan(item.id, { year, ...values }),
    onSuccess: () => {
      invalidate();
      toast("월별 계획을 저장했습니다.", "success");
      setIsPlanModalOpen(false);
    },
  });

  const applySuggestionMutation = useMutation({
    mutationFn: async () => {
      const plan = await fetchSavingsProductAnnualPlanDetail(item.id, year);
      const monthlyTargets = plan.monthly_targets.map((t) =>
        t.year_month === yearMonth ? { ...t, target_amount: item.suggestedMonthlySavingAmount! } : t,
      );
      return upsertSavingsProductAnnualPlan(item.id, {
        year,
        start_month: plan.start_month,
        end_month: plan.end_month,
        monthly_targets: monthlyTargets,
      });
    },
    onSuccess: () => {
      invalidate();
      toast("제안값을 월 계획액에 반영했습니다.", "success");
    },
  });

  const showSuggestion =
    product &&
    item.status !== "ok" &&
    item.suggestedMonthlySavingAmount !== null &&
    item.planned !== null &&
    Number(item.suggestedMonthlySavingAmount) !== Number(item.planned);

  return (
    <div className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <StatusBadge
              size="chip"
              label={savingsProductTypeLabel(item.product_type)}
              toneClassName={savingsProductTypeBadgeStyle(item.product_type)}
              className="shrink-0"
            />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{item.name}</p>
            {product?.linked_goal_id !== null && product?.linked_goal_id !== undefined && (
              <StatusBadge
                size="chip"
                label={`목표: ${product.linked_goal_name}`}
                toneClassName={linkedGoalBadgeStyle()}
                className="shrink-0 max-w-[120px] truncate"
                title={`목표 "${product.linked_goal_name}"의 잔액·월 계획에 포함돼요`}
              />
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {ownerLabel} · {item.detailText}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {product && (
            <button
              type="button"
              onClick={() => setIsPlanModalOpen(true)}
              aria-label="월별 계획 편집"
              title="월별 계획 편집"
              className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950 rounded-lg transition-colors`}
            >
              <Pencil size={14} />
            </button>
          )}
          <span className={`text-sm font-semibold ${planStatusTextClass(item.status)}`}>{formatPercent(item.pct)}</span>
        </div>
      </div>
      {showSuggestion && (
        <SuggestionHint
          className="mt-2"
          actionLabel="월 계획액에 반영"
          applying={applySuggestionMutation.isPending}
          onApply={() => applySuggestionMutation.mutate()}
        >
          최근 3개월 평균 납입액은 {formatKrw(item.suggestedMonthlySavingAmount!)}이에요.
        </SuggestionHint>
      )}
      {isPlanModalOpen && (
        <Modal onClose={() => setIsPlanModalOpen(false)} title={`${item.name} 월별 계획 편집 (${year}년)`}>
          <div className="p-6 overflow-y-auto">
            {isPlanLoading || !planDetail ? (
              <SkeletonCard rows={3} />
            ) : (
              <SavingsProductAnnualPlanForm
                year={year}
                initialValues={{
                  start_month: planDetail.start_month,
                  end_month: planDetail.end_month,
                  monthly_targets: planDetail.monthly_targets,
                }}
                submitting={upsertPlanMutation.isPending}
                onSubmit={(values) => upsertPlanMutation.mutate(values)}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
