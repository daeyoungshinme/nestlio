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
