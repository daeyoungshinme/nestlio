/** "YYYY-MM" 사이의 월 목록을 생성한다(양끝 포함). start가 end보다 뒤거나 둘 중 하나가 비어있으면
 * 빈 배열 — 비정기 목표 폼에서 시작월/종료월 입력에 맞춰 월별 목표금액 행을 자동 생성/재조정하는 데 쓰인다. */
export function buildYearMonthRange(startYearMonth: string, endYearMonth: string): string[] {
  if (!startYearMonth || !endYearMonth) return [];
  const [startYear, startMonth] = startYearMonth.split("-").map(Number);
  const [endYear, endMonth] = endYearMonth.split("-").map(Number);
  const startIndex = startYear * 12 + (startMonth - 1);
  const endIndex = endYear * 12 + (endMonth - 1);
  if (endIndex < startIndex) return [];

  const months: string[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const year = Math.floor(i / 12);
    const month = (i % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return months;
}

/** 시작월/종료월이 바뀌면 그 기간에 맞춰 월별 금액 행을 다시 맞춘다 — 겹치는 달의 금액은 보존.
 * 재무목표 폼(GoalsTab)과 연간계획 항목 폼(AnnualPlanItemForm)이 기간 변경 시 공통으로 쓴다. */
export function syncTargetsToPeriod<T extends { year_month: string; target_amount: string }>(
  startYearMonth: string,
  endYearMonth: string,
  existing: T[],
): { year_month: string; target_amount: string }[] {
  const months = buildYearMonthRange(startYearMonth, endYearMonth);
  const byMonth = new Map(existing.map((t) => [t.year_month, t.target_amount]));
  return months.map((ym) => ({ year_month: ym, target_amount: byMonth.get(ym) ?? "0" }));
}

/** 총액을 `months` 각 달에 균등분배한다(원 단위 정수) — 나머지는 앞쪽 달부터 1원씩 얹어 합계가
 * 총액과 정확히 일치하도록 한다. 백엔드 cashflow_plan_service.split_item_into_months와 같은
 * 나머지 보정 규칙이다. 장기목표(kind="goal") 폼에서 "월별 계획 자동 생성" 버튼에 쓰인다. */
export function distributeAmountEvenly(total: string, months: string[]): Record<string, string> {
  if (months.length === 0) return {};
  const totalAmount = Math.round(Number(total) || 0);
  const base = Math.floor(totalAmount / months.length);
  const remainder = totalAmount - base * months.length;
  const result: Record<string, string> = {};
  months.forEach((ym, i) => {
    result[ym] = String(base + (i < remainder ? 1 : 0));
  });
  return result;
}
