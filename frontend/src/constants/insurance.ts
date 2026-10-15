import type { Coverage, PaymentFrequency, PolicyType } from "@/types";

export const POLICY_TYPE_LABEL: Record<PolicyType, string> = {
  indemnity: "실손의료",
  diagnosis: "진단(암·뇌·심장)",
  life: "종신·정기(사망)",
  accident: "상해",
  auto: "자동차",
  home: "화재·주택",
  savings: "저축성·연금",
  other: "기타",
};

export const PAYMENT_FREQUENCY_LABEL: Record<PaymentFrequency, string> = {
  monthly: "월납",
  yearly: "연납",
};

export const COVERAGE_LABEL: Record<Coverage, string> = {
  medical_indemnity: "실손의료비",
  cancer: "암진단",
  stroke: "뇌혈관",
  heart: "심장",
  surgery: "수술비",
  hospitalization: "입원일당",
  death: "사망",
  disability: "상해후유장해",
  driver: "운전자",
  liability: "일상배상책임",
  dental: "치아",
};

/** 종류를 고르면 미리 체크해 두는 대표 보장 — 사용자가 칩으로 고칠 수 있다. */
export const DEFAULT_COVERAGES: Partial<Record<PolicyType, Coverage[]>> = {
  indemnity: ["medical_indemnity"],
  life: ["death"],
  auto: ["driver"],
};
