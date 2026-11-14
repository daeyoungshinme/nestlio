/** 저축·투자 계획의 저축 + 투자 그룹 합 — 홈 "이번 달 흐름"과 계획 화면(이번 달·연간)이 같은 규칙을 쓴다.
 * 한쪽 실적이라도 없으면(null) 합계 실적도 없음으로 본다 — 0으로 메우면 화면마다 진행률이 달라진다. */
interface GroupActual {
  actual: string | null;
}

export function savingsInvestmentActual(plan: { savings: GroupActual; investment: GroupActual } | undefined): number | null {
  if (!plan || plan.savings.actual === null || plan.investment.actual === null) return null;
  return Number(plan.savings.actual) + Number(plan.investment.actual);
}

export function savingsInvestmentPlanned(plan: { savings: { planned: string }; investment: { planned: string } } | undefined): number {
  return plan ? Number(plan.savings.planned) + Number(plan.investment.planned) : 0;
}
