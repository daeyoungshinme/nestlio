import type { Draft } from "@/components/financialPlan/goalDraft";
import type { FinancialGoalOut } from "@/types";
import { toAmountInputValue } from "@/utils/format";
import { monthsBetween } from "@/utils/monthRange";

/** 장기 목표 폼 "필요 저축액 자동 계산" 미리보기 — 남은 개월 수와 목표까지 필요한 월 저축액.
 *
 * 수정 모드에서 아직 아무것도 고치지 않았다면(초안이 저장된 값과 같다면) 백엔드가 계산해 내려준
 * months_remaining/suggested_monthly_amount(app/services/goal_progress_service.py::compute_months_remaining/
 * compute_suggested_monthly_amount)를 그대로 쓴다. 목표일/나이/필요금액/현재저축액 중 하나라도 바뀌면 "저장하면
 * 어떻게 될지" 미리보기라 같은 식(달 차이, (필요 − 현재) ÷ 남은 개월, 0 미만은 0, 원 단위 반올림)을 여기서 계산한다.
 * 신규 생성은 저장된 값이 없어 항상 이 경로다. 목표일 대신 나이로 정한 목표는 백엔드에 남은 개월 계산이 없어
 * 폼에서 입력한 현재 나이로만 계산한다. */
export function previewGoalPlan({
  draft,
  existingGoal,
  openedAt,
  currentAge,
}: {
  draft: Draft;
  existingGoal: FinancialGoalOut | null;
  openedAt: Date;
  currentAge: string;
}): { monthsRemaining: number | null; suggestedMonthly: number | null } {
  const draftMatchesExistingGoal =
    existingGoal !== null &&
    draft.target_date === (existingGoal.target_date ?? "") &&
    draft.target_age === (existingGoal.target_age !== null ? String(existingGoal.target_age) : "") &&
    draft.required_amount === toAmountInputValue(existingGoal.required_amount) &&
    draft.current_amount === toAmountInputValue(existingGoal.current_amount);

  const monthsRemainingFromDate = draft.target_date !== "" ? monthsBetween(openedAt, new Date(draft.target_date)) : null;
  const monthsRemainingFromAge =
    currentAge !== "" && draft.target_age !== "" ? (Number(draft.target_age) - Number(currentAge)) * 12 : null;
  const monthsRemaining =
    draftMatchesExistingGoal && existingGoal
      ? existingGoal.months_remaining
      : (monthsRemainingFromDate ?? monthsRemainingFromAge);
  const suggestedMonthly =
    draftMatchesExistingGoal && existingGoal && existingGoal.suggested_monthly_amount !== null
      ? Math.round(Number(existingGoal.suggested_monthly_amount))
      : monthsRemaining !== null && monthsRemaining > 0
        ? Math.max(0, Math.round((Number(draft.required_amount) - Number(draft.current_amount)) / monthsRemaining))
        : null;
  return { monthsRemaining, suggestedMonthly };
}
