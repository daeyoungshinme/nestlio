import { useState } from "react";
import { syncTargetsToPeriod } from "@/utils/monthRange";

export interface MonthlyTargetIn {
  year_month: string;
  target_amount: string;
}

/** 연간계획 폼(수입·지출 항목, 저축상품)의 적용 기간과 월별 목표금액 상태. 기간을 바꾸면 월별 행을 그 기간에 맞춰
 * 다시 맞추고(겹치는 달의 금액은 보존), "균등분배할 총액" 초안은 기존 목표금액 합으로 시작한다. */
export function usePlanPeriodTargets(initial: { start_month: string; end_month: string; monthly_targets: MonthlyTargetIn[] }) {
  const [startMonth, setStartMonth] = useState(initial.start_month);
  const [endMonth, setEndMonth] = useState(initial.end_month);
  const [monthlyTargets, setMonthlyTargets] = useState<MonthlyTargetIn[]>(initial.monthly_targets);
  const [totalDraft, setTotalDraft] = useState(() => {
    const existingTotal = initial.monthly_targets.reduce((sum, t) => sum + (Number(t.target_amount) || 0), 0);
    return existingTotal > 0 ? String(existingTotal) : "";
  });

  const changeStartMonth = (next: string) => {
    setStartMonth(next);
    setMonthlyTargets((targets) => syncTargetsToPeriod(next, endMonth, targets));
  };
  const changeEndMonth = (next: string) => {
    setEndMonth(next);
    setMonthlyTargets((targets) => syncTargetsToPeriod(startMonth, next, targets));
  };

  return {
    startMonth,
    endMonth,
    monthlyTargets,
    setMonthlyTargets,
    changeStartMonth,
    changeEndMonth,
    totalDraft,
    setTotalDraft,
  };
}

export type PlanPeriodTargets = ReturnType<typeof usePlanPeriodTargets>;
