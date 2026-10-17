import { riderDraftFrom, riderPayload, type RiderDraft } from "@/components/review/RiderListEditor";
import { DEFAULT_COVERAGES } from "@/constants/insurance";
import { toAmountInputValue } from "@/utils/format";
import type { Coverage, InsurancePolicyIn, InsurancePolicyOut, PaymentFrequency, PolicyType, UserOut } from "@/types";

/** 피보험자 select 값 — 부부 user id 또는 "other"(자녀 등, 이름 직접 입력). */
export const OTHER_INSURED = "other";

export interface PolicyDraft {
  name: string;
  insurer: string;
  policy_type: PolicyType;
  insured: string;
  insured_name: string;
  premium_amount: string;
  payment_frequency: PaymentFrequency;
  is_renewable: boolean;
  next_renewal_date: string;
  payment_end_date: string;
  coverage_end_date: string;
  coverages: Coverage[];
  riders: RiderDraft[];
  recurring_expense_id: string;
  memo: string;
}

export function policyDraftFrom(policy: InsurancePolicyOut | null, users: UserOut[] | undefined): PolicyDraft {
  if (!policy) {
    return {
      name: "",
      insurer: "",
      policy_type: "indemnity",
      insured: users?.[0]?.id ?? OTHER_INSURED,
      insured_name: "",
      premium_amount: "",
      payment_frequency: "monthly",
      is_renewable: false,
      next_renewal_date: "",
      payment_end_date: "",
      coverage_end_date: "",
      coverages: DEFAULT_COVERAGES.indemnity ?? [],
      riders: [],
      recurring_expense_id: "",
      memo: "",
    };
  }
  return {
    name: policy.name,
    insurer: policy.insurer ?? "",
    policy_type: policy.policy_type,
    insured: policy.insured_user_id ?? OTHER_INSURED,
    insured_name: policy.insured_name ?? "",
    premium_amount: toAmountInputValue(policy.premium_amount),
    payment_frequency: policy.payment_frequency,
    is_renewable: policy.is_renewable,
    next_renewal_date: policy.next_renewal_date ?? "",
    payment_end_date: policy.payment_end_date ?? "",
    coverage_end_date: policy.coverage_end_date ?? "",
    coverages: policy.coverages,
    riders: policy.riders.map(riderDraftFrom),
    recurring_expense_id: policy.recurring_expense_id !== null ? String(policy.recurring_expense_id) : "",
    memo: policy.memo ?? "",
  };
}

export function policyPayload(draft: PolicyDraft): InsurancePolicyIn {
  const isOther = draft.insured === OTHER_INSURED;
  const renewable = draft.is_renewable || draft.policy_type === "auto";
  return {
    name: draft.name.trim(),
    insurer: draft.insurer.trim() || null,
    policy_type: draft.policy_type,
    insured_user_id: isOther ? null : draft.insured,
    insured_name: isOther ? draft.insured_name.trim() || null : null,
    premium_amount: draft.premium_amount,
    payment_frequency: draft.payment_frequency,
    is_renewable: renewable,
    next_renewal_date: renewable ? draft.next_renewal_date || null : null,
    payment_end_date: draft.payment_end_date || null,
    coverage_end_date: draft.coverage_end_date || null,
    coverages: draft.coverages,
    // 특약을 넣으면 서버가 특약에서 보장 태그를 다시 만든다. 빈 목록이면 기존 특약을 모두 지운다(폼이 기존 특약으로 시작하므로 의도된 동작).
    riders: draft.riders.map(riderPayload),
    recurring_expense_id: draft.recurring_expense_id ? Number(draft.recurring_expense_id) : null,
    memo: draft.memo.trim() || null,
  };
}

/** 종류를 바꿀 때 보장 태그 — 비어 있거나 이전 종류의 대표 보장 그대로면 새 종류의 대표 보장으로 바꾸고,
 * 직접 고친 건 건드리지 않는다. */
export function withPolicyType(draft: PolicyDraft, policyType: PolicyType): PolicyDraft {
  const prevDefaults = DEFAULT_COVERAGES[draft.policy_type] ?? [];
  const untouched =
    draft.coverages.length === prevDefaults.length && draft.coverages.every((c) => prevDefaults.includes(c));
  return {
    ...draft,
    policy_type: policyType,
    coverages: untouched ? (DEFAULT_COVERAGES[policyType] ?? []) : draft.coverages,
  };
}
