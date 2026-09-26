/** 목표 달성 가속 추정 — growlio 연동 목표에 이번 달 여유자금을 한 번 더 넣으면
 * 목표 달성이 얼마나 앞당겨지는지. monthRange(월 범위 생성/균등분배)와는 별개 개념이라
 * 파일을 분리했다. */

export interface GoalAcceleration {
  monthsSaved: number;
  newMonthsRemaining: number;
}

/** growlio 연동 목표에 이번 달 여유자금을 한 번 더 넣으면 목표 달성이 얼마나 앞당겨지는지
 * 추정한다 — 백엔드가 이미 계산해주는 목표일 기준 페이스(monthsRemaining/suggestedMonthlyAmount,
 * app/services/goal_service.py)를 그대로 쓰고, 여기에 여유자금만큼 남은 금액을 한 번에 줄인 뒤
 * 같은 페이스로 다시 필요한 개월 수를 구하는 순수 프론트 계산이다(백엔드 변경 없음, 균등분배
 * 재계산과 같은 패턴). 페이스나 남은 개월을 알 수 없거나(챌린지, 목표일 미설정) 앞당겨지는
 * 개월이 0 이하면 null — "0개월 앞당겨져요" 같은 무의미한 문구를 막기 위함. */
export function estimateGoalAcceleration(
  requiredAmount: string,
  currentAmount: string,
  monthsRemaining: number | null,
  suggestedMonthlyAmount: string | null,
  surplus: string,
): GoalAcceleration | null {
  const pace = Number(suggestedMonthlyAmount ?? 0);
  const extra = Number(surplus);
  if (!monthsRemaining || monthsRemaining <= 0 || pace <= 0 || extra <= 0) return null;

  const remaining = Math.max(0, Number(requiredAmount) - Number(currentAmount));
  if (remaining <= 0) return null;

  const remainingAfterSurplus = Math.max(0, remaining - extra);
  const newMonthsRemaining = Math.ceil(remainingAfterSurplus / pace);
  const monthsSaved = monthsRemaining - newMonthsRemaining;
  if (monthsSaved <= 0) return null;

  return { monthsSaved, newMonthsRemaining };
}

/** "월 N원 더 모으면?" 시나리오 — 남은 금액을 (현재 월 계획 + 추가액)으로 나눠 필요한 개월 수를 구하고, 추가액이
 * 없을 때보다 몇 개월 빨라지는지 돌려준다. 수익률 없는 선형 계산(백엔드 compute_eta_year_month와 같은 가정).
 * 월 계획이 0이고 추가액도 0이면 영원히 못 모으므로 baseMonths/newMonths가 null이다. */
export function monthsToGoalWithExtra(
  requiredAmount: string,
  currentAmount: string,
  monthlyAmount: string,
  extraMonthly: number,
): { baseMonths: number | null; newMonths: number | null; monthsSaved: number } {
  const remaining = Math.max(0, Number(requiredAmount) - Number(currentAmount));
  const base = Number(monthlyAmount);
  if (remaining <= 0) return { baseMonths: 0, newMonths: 0, monthsSaved: 0 };
  const baseMonths = base > 0 ? Math.ceil(remaining / base) : null;
  const withExtra = base + Math.max(0, extraMonthly);
  const newMonths = withExtra > 0 ? Math.ceil(remaining / withExtra) : null;
  const monthsSaved = baseMonths !== null && newMonths !== null ? baseMonths - newMonths : 0;
  return { baseMonths, newMonths, monthsSaved };
}
