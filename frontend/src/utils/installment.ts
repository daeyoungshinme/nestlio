import { formatKrw, formatPercent } from "@/utils/format";
import type { CashflowPlanItemOut } from "@/types";

/** "YYYY-MM"이 속한 연도의 12월까지 남은 개월 수 (자기 자신 포함). 예: "2026-08" -> 5 */
export function monthsRemainingInYear(yearMonth: string): number {
  const month = Number(yearMonth.split("-")[1]);
  return 13 - month;
}

/**
 * 할부 분할로 생성된 항목에 대해 "총 N원 중 M원 진행 (X%)" 텍스트를 만든다.
 * 진행률은 실제 지출이 아니라 할부 회차 기준(installment_no / installment_total)이다 —
 * 비정기지출은 실거래와 연결되지 않으므로 실적을 계산할 수 없다.
 * 할부가 아닌 일반 항목(installment_total_amount 없음)이면 null을 반환한다.
 */
export function installmentProgressLabel(
  item: Pick<CashflowPlanItemOut, "installment_no" | "installment_total" | "installment_total_amount">,
): string | null {
  if (item.installment_total_amount === null || item.installment_no === null || item.installment_total === null) {
    return null;
  }
  const total = Number(item.installment_total_amount);
  const achieved = (total * item.installment_no) / item.installment_total;
  const pct = item.installment_total > 0 ? (item.installment_no / item.installment_total) * 100 : 0;
  return `총 ${formatKrw(total)} 중 ${formatKrw(achieved)} 진행 (${formatPercent(pct)})`;
}
