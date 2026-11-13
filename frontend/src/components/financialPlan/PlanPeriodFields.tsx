import { useId } from "react";
import AmountInput from "@/components/common/AmountInput";
import AnnualPlanMonthlyGrid from "@/components/financialPlan/AnnualPlanMonthlyGrid";
import type { PlanPeriodTargets } from "@/components/financialPlan/usePlanPeriodTargets";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { formatMonthOnly } from "@/utils/format";
import { buildYearMonthRange } from "@/utils/monthRange";

/** 그 해 안의 적용 시작월·종료월 선택 — 시작월은 종료월 이하, 종료월은 시작월 이상만 고를 수 있다. */
export function MonthRangeSelect({
  year,
  startMonth,
  endMonth,
  onChangeStart,
  onChangeEnd,
}: {
  year: number;
  startMonth: string;
  endMonth: string;
  onChangeStart: (yearMonth: string) => void;
  onChangeEnd: (yearMonth: string) => void;
}) {
  const fieldId = useId();
  const monthOptions = buildYearMonthRange(`${year}-01`, `${year}-12`);
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label htmlFor={`${fieldId}-start`} className={`block mb-1 font-medium ${LABEL_SM}`}>적용 시작월</label>
        <select
          id={`${fieldId}-start`}
          className={`${INPUT_SM} w-full`}
          value={startMonth}
          onChange={(e) => onChangeStart(e.target.value)}
        >
          {monthOptions
            .filter((ym) => ym <= endMonth)
            .map((ym) => (
              <option key={ym} value={ym}>
                {formatMonthOnly(ym)}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${fieldId}-end`} className={`block mb-1 font-medium ${LABEL_SM}`}>적용 종료월</label>
        <select
          id={`${fieldId}-end`}
          className={`${INPUT_SM} w-full`}
          value={endMonth}
          onChange={(e) => onChangeEnd(e.target.value)}
        >
          {monthOptions
            .filter((ym) => ym >= startMonth)
            .map((ym) => (
              <option key={ym} value={ym}>
                {formatMonthOnly(ym)}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

/** 적용 기간 + 균등분배할 총액 + 월별 목표금액 그리드 — 연간계획 항목 폼과 저축상품 연간계획 폼이 함께 쓴다. */
export default function PlanPeriodFields({ year, period }: { year: number; period: PlanPeriodTargets }) {
  return (
    <>
      <MonthRangeSelect
        year={year}
        startMonth={period.startMonth}
        endMonth={period.endMonth}
        onChangeStart={period.changeStartMonth}
        onChangeEnd={period.changeEndMonth}
      />
      <AmountInput
        label="균등분배할 총액"
        value={period.totalDraft}
        onChange={period.setTotalDraft}
        hint="이 금액을 적용 기간의 달에 고르게 나눠 채워요. 지금까지 입력된 실제 합계는 아래 '월별 목표금액 합계'를 보세요."
      />
      <AnnualPlanMonthlyGrid
        startMonth={period.startMonth}
        endMonth={period.endMonth}
        targets={period.monthlyTargets}
        onChange={period.setMonthlyTargets}
        distributeAmount={period.totalDraft}
      />
    </>
  );
}
