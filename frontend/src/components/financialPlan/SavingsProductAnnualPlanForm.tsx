import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import PlanPeriodFields from "@/components/financialPlan/PlanPeriodFields";
import { usePlanPeriodTargets } from "@/components/financialPlan/usePlanPeriodTargets";
import type { SavingsProductAnnualPlanMonthlyTargetIn } from "@/types";

export interface SavingsProductAnnualPlanFormValues {
  start_month: string;
  end_month: string;
  monthly_targets: SavingsProductAnnualPlanMonthlyTargetIn[];
}

interface Props {
  year: number;
  initialValues: SavingsProductAnnualPlanFormValues;
  submitLabel?: string;
  submitting?: boolean;
  onSubmit: (values: SavingsProductAnnualPlanFormValues) => void;
}

/** AnnualPlanItemForm(수입/지출)의 저축상품 버전 — 이름/카테고리/구분 입력이 없다(이미 등록된
 * SavingsProduct 하나에 대한 편집이므로). 적용 시작월~종료월 + "균등분배할 총액" +
 * AnnualPlanMonthlyGrid로 그 기간의 월별 목표금액을 입력한다. initialValues는 항상 "지금 유효한
 * 계획"으로 채워져서 들어온다(저장된 그리드가 없으면 monthly_saving_amount로 채운 기본값 —
 * savings_product_plan_service.get_annual_plan 참고). */
export default function SavingsProductAnnualPlanForm({
  year,
  initialValues,
  submitLabel = "저장",
  submitting,
  onSubmit,
}: Props) {
  const period = usePlanPeriodTargets(initialValues);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ start_month: period.startMonth, end_month: period.endMonth, monthly_targets: period.monthlyTargets });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <PlanPeriodFields year={year} period={period} />
      <Button type="submit" loading={submitting} className="w-full justify-center">
        {submitLabel}
      </Button>
    </form>
  );
}
