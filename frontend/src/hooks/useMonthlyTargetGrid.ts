import { buildYearMonthRange, distributeAmountEvenly } from "@/utils/monthRange";
import { toAmountInputValue } from "@/utils/format";

interface MonthlyTarget {
  year_month: string;
  target_amount: string;
}

/**
 * 시작월~종료월 사이의 월별 목표금액 입력 상태를 다루는 공용 로직 — AnnualPlanMonthlyGrid와
 * GoalMonthlyTargetEditor가 공유한다(둘 다 "월 목록 생성 → 금액 맵 → 개별 수정/균등분배" 상호작용은
 * 같고, 행 렌더링(월 레이블 포맷, "나머지 달에 적용" 버튼 유무)만 다르다).
 */
export function useMonthlyTargetGrid(
  startMonth: string,
  endMonth: string,
  targets: MonthlyTarget[],
  onChange: (targets: MonthlyTarget[]) => void,
) {
  const months = buildYearMonthRange(startMonth, endMonth);
  const amountByMonth = new Map(targets.map((t) => [t.year_month, toAmountInputValue(t.target_amount)]));
  const total = targets.reduce((sum, t) => sum + (Number(t.target_amount) || 0), 0);

  const setAmount = (yearMonth: string, amount: string) => {
    const next = months.map((ym) => ({
      year_month: ym,
      target_amount: ym === yearMonth ? amount : (amountByMonth.get(ym) ?? "0"),
    }));
    onChange(next);
  };

  const handleDistributeEvenly = (distributeAmount: string) => {
    const distributed = distributeAmountEvenly(distributeAmount ?? "0", months);
    onChange(months.map((ym) => ({ year_month: ym, target_amount: distributed[ym] ?? "0" })));
  };

  return { months, amountByMonth, total, setAmount, handleDistributeEvenly };
}
