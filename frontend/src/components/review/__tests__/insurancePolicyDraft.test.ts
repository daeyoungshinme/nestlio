import { describe, expect, it } from "vitest";
import {
  OTHER_INSURED,
  policyDraftFrom,
  policyPayload,
  withPolicyType,
} from "@/components/review/insurancePolicyDraft";
import { coverageLabel } from "@/constants/insurance";
import type { InsurancePolicyOut, UserOut } from "@/types";

const USERS = [{ id: "u1", display_name: "대영" }] as UserOut[];

const POLICY: InsurancePolicyOut = {
  id: 1,
  name: "실손",
  insurer: null,
  policy_type: "indemnity",
  insured_user_id: null,
  insured_name: "아이",
  premium_amount: "30000.00",
  payment_frequency: "monthly",
  monthly_premium: "30000.00",
  is_renewable: false,
  next_renewal_date: "2027-01-01",
  payment_end_date: null,
  coverage_end_date: null,
  coverages: ["medical_indemnity"],
  riders: [],
  riders_monthly_premium: "0.00",
  main_monthly_premium: "30000.00",
  recurring_expense_id: 7,
  memo: null,
  is_active: true,
  sort_order: 0,
};

describe("policyDraftFrom / policyPayload", () => {
  it("새 계약은 첫 배우자·실손 대표 보장으로 시작한다", () => {
    const draft = policyDraftFrom(null, USERS);
    expect(draft.insured).toBe("u1");
    expect(draft.coverages).toEqual(["medical_indemnity"]);
  });

  it("자녀 등 그 외 피보험자는 이름으로, 비갱신형이면 갱신일을 보내지 않는다", () => {
    const draft = policyDraftFrom(POLICY, USERS);
    expect(draft.insured).toBe(OTHER_INSURED);
    expect(draft.premium_amount).toBe("30000");

    const payload = policyPayload({ ...draft, insured_name: " 아이 " });
    expect(payload).toMatchObject({
      insured_user_id: null,
      insured_name: "아이",
      next_renewal_date: null,
      recurring_expense_id: 7,
      riders: [],
    });
  });

  it("자동차보험은 갱신형으로 보내고, 배우자 피보험자는 이름을 보내지 않는다", () => {
    const draft = { ...policyDraftFrom(null, USERS), name: "자동차", premium_amount: "800000", insured_name: "무시" };
    const payload = policyPayload({ ...withPolicyType(draft, "auto"), next_renewal_date: "2027-03-01" });
    expect(payload).toMatchObject({
      policy_type: "auto",
      is_renewable: true,
      next_renewal_date: "2027-03-01",
      insured_user_id: "u1",
      insured_name: null,
    });
  });
});

describe("withPolicyType", () => {
  it("대표 보장 그대로면 새 종류의 대표 보장으로 바꾼다", () => {
    expect(withPolicyType(policyDraftFrom(null, USERS), "life").coverages).toEqual(["death"]);
  });

  it("직접 고친 보장은 건드리지 않는다", () => {
    const edited = { ...policyDraftFrom(null, USERS), coverages: ["medical_indemnity" as const, "cancer" as const] };
    expect(withPolicyType(edited, "life").coverages).toEqual(["medical_indemnity", "cancer"]);
  });
});

describe("coverageLabel", () => {
  it("아는 키는 표시 이름, 모르는 키는 그대로", () => {
    expect(coverageLabel("cancer")).toBe("암진단");
    expect(coverageLabel("other")).toBe("기타");
    expect(coverageLabel("new_tag")).toBe("new_tag");
  });
});
