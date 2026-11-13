import type { Draft } from "@/components/financialPlan/goalDraft";
import type { AccountWithBalanceOut, FinancialGoalOut, LoanOut, SavingsProductOut } from "@/types";
import { toAmountInputValue } from "@/utils/format";
import { monthsBetween } from "@/utils/monthRange";

function isLinked(draft: Draft): boolean {
  return draft.savings_product_ids.length > 0 || draft.account_ids.length > 0 || draft.loan_ids.length > 0;
}

/** 초안 기준 "현재 저축액" — 저장하면 백엔드가 쓸 값(app/services/goal_progress_service.py::compute_current_amount).
 * 자금원이 연동돼 있으면 고른 상품·계좌 잔액 합에서 고른 대출 잔액을 뺀 값이고(폼의 "현재 저축액" 칸은 숨겨져 쓰이지
 * 않는다), 연동이 없으면 폼 값이다(월별 계획을 쓰는 기존 목표는 이 값이 이미 달성액 합이다). */
export function draftCurrentAmount(
  draft: Draft,
  sources: { savingsProducts: SavingsProductOut[]; accounts: AccountWithBalanceOut[]; loans: LoanOut[] },
): number {
  if (!isLinked(draft)) return Number(draft.current_amount) || 0;
  const productTotal = sources.savingsProducts
    .filter((p) => draft.savings_product_ids.includes(String(p.id)))
    .reduce((sum, p) => sum + Number(p.current_balance), 0);
  const accountTotal = sources.accounts
    .filter(({ account }) => draft.account_ids.includes(String(account.id)))
    .reduce((sum, { balance }) => sum + Number(balance), 0);
  const loanTotal = sources.loans
    .filter((loan) => draft.loan_ids.includes(String(loan.id)))
    .reduce((sum, loan) => sum + Number(loan.balance), 0);
  return productTotal + accountTotal - loanTotal;
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** 초안의 연동 자금원이 저장된 목표와 같은가. */
function sameFundingSources(draft: Draft, goal: FinancialGoalOut): boolean {
  const ids = (type: string) => goal.funding_sources.filter((fs) => fs.type === type).map((fs) => String(fs.id));
  return (
    sameIds(draft.savings_product_ids, ids("savings_product")) &&
    sameIds(draft.account_ids, ids("account")) &&
    sameIds(draft.loan_ids, ids("loan"))
  );
}

/** 장기 목표 폼 "필요 저축액 자동 계산" 미리보기 — 남은 개월 수와 목표까지 필요한 월 저축액.
 *
 * 수정 모드에서 아직 아무것도 고치지 않았다면(목표일·나이·필요금액·현재저축액·연동 자금원이 저장된 값과 같다면) 백엔드가
 * 계산해 내려준 months_remaining/suggested_monthly_amount(app/services/goal_progress_service.py::compute_months_remaining/
 * compute_suggested_monthly_amount)를 그대로 쓴다. 하나라도 바뀌면 "저장하면 어떻게 될지" 미리보기라 같은 식(달 차이,
 * (필요 − 현재) ÷ 남은 개월, 0 미만은 0, 원 단위 반올림)을 여기서 계산한다. 현재 금액은 `draftCurrentAmount`로 받는다
 * (연동 목표는 연동 잔액). 신규 생성은 저장된 값이 없어 항상 이 경로다. 목표일 대신 나이로 정한 목표는 백엔드에 남은
 * 개월 계산이 없어 폼에서 입력한 현재 나이로만 계산한다. */
export function previewGoalPlan({
  draft,
  existingGoal,
  openedAt,
  currentAge,
  currentAmount,
}: {
  draft: Draft;
  existingGoal: FinancialGoalOut | null;
  openedAt: Date;
  currentAge: string;
  currentAmount: number;
}): { monthsRemaining: number | null; suggestedMonthly: number | null } {
  const draftMatchesExistingGoal =
    existingGoal !== null &&
    draft.target_date === (existingGoal.target_date ?? "") &&
    draft.target_age === (existingGoal.target_age !== null ? String(existingGoal.target_age) : "") &&
    draft.required_amount === toAmountInputValue(existingGoal.required_amount) &&
    draft.current_amount === toAmountInputValue(existingGoal.current_amount) &&
    sameFundingSources(draft, existingGoal);

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
        ? Math.max(0, Math.round((Number(draft.required_amount) - currentAmount) / monthsRemaining))
        : null;
  return { monthsRemaining, suggestedMonthly };
}
