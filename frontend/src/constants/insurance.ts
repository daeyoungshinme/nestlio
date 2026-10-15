import type { Coverage, CoverageStatus, InsuranceTargetsOut, PaymentFrequency, PolicyType, RiderCoverage } from "@/types";

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
  driver_legal: "운전자 벌금·합의·변호사비",
  liability: "일상배상책임",
  dental: "치아",
};

/** 종류를 고르면 미리 체크해 두는 대표 보장 — 사용자가 칩으로 고칠 수 있다. */
export const DEFAULT_COVERAGES: Partial<Record<PolicyType, Coverage[]>> = {
  indemnity: ["medical_indemnity"],
  life: ["death"],
  auto: ["driver"],
};

export const RIDER_COVERAGE_LABEL: Record<RiderCoverage, string> = { ...COVERAGE_LABEL, other: "기타" };

/** 백엔드가 str로 주는 보장 키(현황표·상위 특약)의 표시 이름 — 모르는 키는 그대로. */
export function coverageLabel(coverage: string): string {
  return (RIDER_COVERAGE_LABEL as Record<string, string>)[coverage] ?? coverage;
}

/** 적정 가입금액을 설정할 수 있는 정액 보장 — 백엔드 app/constants/insurance.py TARGETED_COVERAGES와 같은 순서. */
export const TARGETED_COVERAGES = ["cancer", "stroke", "heart", "hospitalization", "death", "disability"] as const satisfies readonly (keyof InsuranceTargetsOut)[];

export const COVERAGE_STATUS_LABEL: Record<CoverageStatus, string> = {
  over: "과다",
  ok: "적정",
  gap: "부족",
  no_target: "기준 없음",
};
