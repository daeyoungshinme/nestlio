import { currentDateIso } from "@/utils/date";
import { toAmountInputValue } from "@/utils/format";
import type { FinancialGoalOut, FundingSourceIn, GoalKind, GoalMonthlyTargetIn } from "@/types";

/** GoalsTab / GoalFormModal이 공유하는 폼 초안 타입과 초안↔페이로드 변환. */
export interface Draft {
  kind: GoalKind;
  priority: string;
  name: string;
  description: string;
  target_age: string;
  target_date: string;
  start_date: string;
  required_amount: string;
  monthly_saving_amount: string;
  current_amount: string;
  savings_product_ids: string[];
  account_ids: string[];
  loan_ids: string[];
  monthly_targets: GoalMonthlyTargetIn[];
}

export const EMPTY_GOAL_DRAFT: Draft = {
  kind: "goal",
  priority: "1",
  name: "",
  description: "",
  target_age: "",
  target_date: "",
  start_date: "",
  required_amount: "0",
  monthly_saving_amount: "0",
  current_amount: "0",
  savings_product_ids: [],
  account_ids: [],
  loan_ids: [],
  monthly_targets: [],
};

export const EMPTY_CHALLENGE_DRAFT: Draft = {
  ...EMPTY_GOAL_DRAFT,
  kind: "challenge",
  start_date: currentDateIso(),
  target_date: currentDateIso(),
};

/** "YYYY-MM-DD" -> "YYYY-MM" (GoalMonthlyTargetEditor에 넘길 시작월/종료월 계산용). */
export function toYearMonth(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function draftFromGoal(goal: FinancialGoalOut): Draft {
  return {
    kind: goal.kind,
    priority: String(goal.priority),
    name: goal.name,
    description: goal.description ?? "",
    target_age: goal.target_age !== null ? String(goal.target_age) : "",
    target_date: goal.target_date ?? "",
    start_date: goal.start_date ?? currentDateIso(),
    required_amount: toAmountInputValue(goal.required_amount),
    monthly_saving_amount: toAmountInputValue(goal.monthly_saving_amount),
    current_amount: toAmountInputValue(goal.current_amount),
    savings_product_ids: goal.funding_sources.filter((fs) => fs.type === "savings_product").map((fs) => String(fs.id)),
    account_ids: goal.funding_sources.filter((fs) => fs.type === "account").map((fs) => String(fs.id)),
    loan_ids: goal.funding_sources.filter((fs) => fs.type === "loan").map((fs) => String(fs.id)),
    monthly_targets: goal.monthly_targets.map((mt) => ({
      year_month: mt.year_month,
      target_amount: toAmountInputValue(mt.target_amount),
    })),
  };
}

export function toPayload(draft: Draft) {
  const isChallenge = draft.kind === "challenge";
  const funding_sources: FundingSourceIn[] = isChallenge
    ? []
    : [
        ...draft.savings_product_ids.map((id) => ({ type: "savings_product" as const, id: Number(id) })),
        ...draft.account_ids.map((id) => ({ type: "account" as const, id: Number(id) })),
        ...draft.loan_ids.map((id) => ({ type: "loan" as const, id: Number(id) })),
      ];
  return {
    kind: draft.kind,
    priority: Number(draft.priority) || 1,
    name: draft.name,
    description: isChallenge && draft.description.trim() !== "" ? draft.description : null,
    target_age: isChallenge || draft.target_age === "" ? null : Number(draft.target_age),
    target_date: draft.target_date === "" ? null : draft.target_date,
    required_amount: draft.required_amount,
    monthly_saving_amount: isChallenge ? "0" : draft.monthly_saving_amount,
    current_amount: draft.current_amount,
    funding_sources,
    start_date: isChallenge ? draft.start_date : null,
    // 장기목표(goal)는 필요금액을 월별 계획 합계로 덮어쓰지 않는다 — 월별 계획은 페이스 참고용
    // 그리드일 뿐이라 그대로 보낸다(FinancialGoalOut.required_amount 참고).
    monthly_targets: !isChallenge ? draft.monthly_targets : null,
  };
}
