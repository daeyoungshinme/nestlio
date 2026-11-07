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
  /** 기대 연수익률(%) — 비우면 null(복리 ETA 없음) */
  expected_annual_return_pct: string;
  current_amount: string;
  savings_product_ids: string[];
  account_ids: string[];
  loan_ids: string[];
  monthly_targets: GoalMonthlyTargetIn[];
  /** kind==="combined"만: 묶을 장기 목표 id와 growlio 목표를 합산할 가구 구성원 id. */
  member_goal_ids: string[];
  growlio_user_ids: string[];
  /** kind==="net_worth"만: 진행금액에서 부동산과 그 짝 담보대출을 뺀다. */
  exclude_real_estate: boolean;
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
  expected_annual_return_pct: "",
  current_amount: "0",
  savings_product_ids: [],
  account_ids: [],
  loan_ids: [],
  monthly_targets: [],
  member_goal_ids: [],
  growlio_user_ids: [],
  exclude_real_estate: false,
};

/** 챌린지 기본값의 시작/종료일은 "지금" 오늘이어야 하므로 모듈 로드 시점에 고정하지 않고 매번 만든다 —
 * 탭을 자정 넘게 열어두면(퍼시스트 캐시로 흔함) 상수는 어제 날짜를 기본값으로 내놓는다. */
export function emptyChallengeDraft(): Draft {
  const today = currentDateIso();
  return { ...EMPTY_GOAL_DRAFT, kind: "challenge", start_date: today, target_date: today };
}

/** 순자산 목표 — 이름만 기본값을 채운다(자금원·월별 계획·현재 금액은 가구 순자산과 저축·투자 계획이 대신한다). */
export function emptyNetWorthDraft(): Draft {
  return { ...EMPTY_GOAL_DRAFT, kind: "net_worth", name: "우리 순자산 목표" };
}

/** 부부 통합 목표 — 기본으로 가구 구성원 모두의 growlio 목표를 묶는다(자금원·월별 계획·현재 금액은 구성 합이 대신한다). */
export function emptyCombinedDraft(userIds: string[]): Draft {
  return { ...EMPTY_GOAL_DRAFT, kind: "combined", name: "우리 부부 통합 목표", growlio_user_ids: userIds };
}

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
    expected_annual_return_pct: goal.expected_annual_return_pct !== null ? String(Number(goal.expected_annual_return_pct)) : "",
    current_amount: toAmountInputValue(goal.current_amount),
    savings_product_ids: goal.funding_sources.filter((fs) => fs.type === "savings_product").map((fs) => String(fs.id)),
    account_ids: goal.funding_sources.filter((fs) => fs.type === "account").map((fs) => String(fs.id)),
    loan_ids: goal.funding_sources.filter((fs) => fs.type === "loan").map((fs) => String(fs.id)),
    monthly_targets: goal.monthly_targets.map((mt) => ({
      year_month: mt.year_month,
      target_amount: toAmountInputValue(mt.target_amount),
    })),
    member_goal_ids: goal.combined_members.filter((m) => m.goal_id !== null).map((m) => String(m.goal_id)),
    growlio_user_ids: goal.combined_members.filter((m) => m.user_id !== null).map((m) => m.user_id as string),
    // 필드 추가 전의 영속 캐시 응답에는 없을 수 있다.
    exclude_real_estate: goal.exclude_real_estate ?? false,
  };
}

export function toPayload(draft: Draft) {
  const isChallenge = draft.kind === "challenge";
  const isCombined = draft.kind === "combined";
  // 순자산·통합 목표는 진행금액·월 계획을 다른 원본(가구 순자산, 구성 합)에서 가져와 자금원·월별 계획·직접 입력이 없다.
  const isNetWorth = draft.kind === "net_worth" || isCombined;
  const funding_sources: FundingSourceIn[] = isChallenge || isNetWorth
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
    target_age: isChallenge || isNetWorth || draft.target_age === "" ? null : Number(draft.target_age),
    target_date: draft.target_date === "" ? null : draft.target_date,
    required_amount: draft.required_amount,
    monthly_saving_amount: isChallenge || isNetWorth ? "0" : draft.monthly_saving_amount,
    expected_annual_return_pct:
      isChallenge || draft.expected_annual_return_pct.trim() === "" ? null : draft.expected_annual_return_pct,
    current_amount: isNetWorth ? "0" : draft.current_amount,
    funding_sources,
    start_date: isChallenge ? draft.start_date : null,
    // 장기목표(goal)는 필요금액을 월별 계획 합계로 덮어쓰지 않는다 — 월별 계획은 페이스 참고용
    // 그리드일 뿐이라 그대로 보낸다(FinancialGoalOut.required_amount 참고).
    monthly_targets: !isChallenge && !isNetWorth ? draft.monthly_targets : null,
    member_goal_ids: isCombined ? draft.member_goal_ids.map(Number) : null,
    growlio_user_ids: isCombined ? draft.growlio_user_ids : null,
    exclude_real_estate: draft.kind === "net_worth" && draft.exclude_real_estate,
  };
}
