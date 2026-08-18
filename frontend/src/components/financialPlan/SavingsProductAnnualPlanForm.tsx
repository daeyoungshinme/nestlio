import { useState } from "react";
import type { FormEvent } from "react";
import AnnualPlanMonthlyGrid from "@/components/financialPlan/AnnualPlanMonthlyGrid";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { syncTargetsToPeriod } from "@/utils/monthRange";
import { formatKrwPreview } from "@/utils/format";
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
 * savings_product_service.get_annual_plan 참고). */
export default function SavingsProductAnnualPlanForm({
  year,
  initialValues,
  submitLabel = "저장",
  submitting,
  onSubmit,
}: Props) {
  const [startMonth, setStartMonth] = useState(initialValues.start_month);
  const [endMonth, setEndMonth] = useState(initialValues.end_month);
  const [monthlyTargets, setMonthlyTargets] = useState<SavingsProductAnnualPlanMonthlyTargetIn[]>(
    initialValues.monthly_targets,
  );
  const existingTotal = initialValues.monthly_targets.reduce((sum, t) => sum + (Number(t.target_amount) || 0), 0);
  const [totalDraft, setTotalDraft] = useState(existingTotal > 0 ? String(existingTotal) : "");

  const monthOptions = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  const changeStartMonth = (next: string) => {
    setStartMonth(next);
    setMonthlyTargets((targets) => syncTargetsToPeriod(next, endMonth, targets));
  };
  const changeEndMonth = (next: string) => {
    setEndMonth(next);
    setMonthlyTargets((targets) => syncTargetsToPeriod(startMonth, next, targets));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ start_month: startMonth, end_month: endMonth, monthly_targets: monthlyTargets });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>적용 시작월</label>
          <select
            className={`${INPUT_SM} w-full`}
            value={startMonth}
            onChange={(e) => changeStartMonth(e.target.value)}
          >
            {monthOptions
              .filter((ym) => ym <= endMonth)
              .map((ym) => (
                <option key={ym} value={ym}>
                  {Number(ym.slice(5))}월
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>적용 종료월</label>
          <select className={`${INPUT_SM} w-full`} value={endMonth} onChange={(e) => changeEndMonth(e.target.value)}>
            {monthOptions
              .filter((ym) => ym >= startMonth)
              .map((ym) => (
                <option key={ym} value={ym}>
                  {Number(ym.slice(5))}월
                </option>
              ))}
          </select>
        </div>
      </div>
      <FormInput
        label="균등분배할 총액"
        type="number"
        inputMode="decimal"
        value={totalDraft}
        onChange={(e) => setTotalDraft(e.target.value)}
        hint="이 금액을 적용 기간의 달에 고르게 나눠 채워요. 지금까지 입력된 실제 합계는 아래 '월별 목표금액 합계'를 보세요."
        preview={Number(totalDraft) > 0 ? formatKrwPreview(Number(totalDraft)) : undefined}
      />
      <AnnualPlanMonthlyGrid
        startMonth={startMonth}
        endMonth={endMonth}
        targets={monthlyTargets}
        onChange={setMonthlyTargets}
        distributeAmount={totalDraft}
      />
      <Button type="submit" loading={submitting} className="w-full justify-center">
        {submitLabel}
      </Button>
    </form>
  );
}
