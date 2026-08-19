import type { CoachingThresholdsOut } from "@/types";

export interface CoachingThresholdPreset {
  key: string;
  label: string;
  values: CoachingThresholdsOut;
}

/** "고급: 코칭 기준값"의 16개 필드를 한 번에 채우는 프리셋 — 개별 입력 진입장벽을 낮추기 위한
 * 대표 시나리오 3가지. 저장은 여전히 사용자가 "저장" 버튼을 눌러야 확정된다. */
export const COACHING_THRESHOLD_PRESETS: CoachingThresholdPreset[] = [
  {
    key: "newlywed",
    label: "신혼부부",
    values: {
      savings_rate_warn: 30,
      savings_rate_critical: 20,
      fixed_cost_ratio_warn: 35,
      fixed_cost_ratio_critical: 45,
      budget_warn_pct: 90,
      budget_critical_pct: 100,
      discretionary_ratio_warn: 12,
      debt_ratio_warn: 30,
      benchmark_food_warn_pct: 13,
      benchmark_housing_warn_pct: 30,
      benchmark_communication_warn_pct: 5,
      benchmark_transport_warn_pct: 10,
      benchmark_leisure_warn_pct: 12,
      benchmark_healthcare_warn_pct: 5,
      benchmark_education_warn_pct: 3,
      benchmark_insurance_warn_pct: 7,
    },
  },
  {
    key: "with_kids",
    label: "자녀 있음",
    values: {
      savings_rate_warn: 15,
      savings_rate_critical: 8,
      fixed_cost_ratio_warn: 45,
      fixed_cost_ratio_critical: 55,
      budget_warn_pct: 85,
      budget_critical_pct: 95,
      discretionary_ratio_warn: 10,
      debt_ratio_warn: 35,
      benchmark_food_warn_pct: 16,
      benchmark_housing_warn_pct: 26,
      benchmark_communication_warn_pct: 6,
      benchmark_transport_warn_pct: 9,
      benchmark_leisure_warn_pct: 7,
      benchmark_healthcare_warn_pct: 8,
      benchmark_education_warn_pct: 18,
      benchmark_insurance_warn_pct: 9,
    },
  },
  {
    key: "retirement_prep",
    label: "은퇴 준비",
    values: {
      savings_rate_warn: 35,
      savings_rate_critical: 25,
      fixed_cost_ratio_warn: 35,
      fixed_cost_ratio_critical: 45,
      budget_warn_pct: 90,
      budget_critical_pct: 100,
      discretionary_ratio_warn: 10,
      debt_ratio_warn: 20,
      benchmark_food_warn_pct: 14,
      benchmark_housing_warn_pct: 24,
      benchmark_communication_warn_pct: 5,
      benchmark_transport_warn_pct: 8,
      benchmark_leisure_warn_pct: 10,
      benchmark_healthcare_warn_pct: 10,
      benchmark_education_warn_pct: 3,
      benchmark_insurance_warn_pct: 10,
    },
  },
];
