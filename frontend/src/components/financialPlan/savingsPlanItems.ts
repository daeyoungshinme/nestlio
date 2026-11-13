import type {
  SavingsProductAnnualPlanGroupOut,
  SavingsProductAnnualPlanItemOut,
  SavingsProductPlanGroupOut,
  SavingsProductPlanItemOut,
} from "@/types";
import { formatKrw } from "@/utils/format";

/** 저축·투자 계획 패널의 "이번 달"/"올해 누적" 행을 같은 모양으로 맞춘 값. */
export interface NormalizedItem {
  id: number;
  name: string;
  product_type: "savings" | "investment";
  detailText: string;
  pct: number;
  status: "ok" | "warn" | "critical";
  /** "이번 달" 뷰에서만 존재 — 제안값(최근 3개월 평균)이 이미 계획액과 같은지 비교하는 데 쓰인다. */
  planned: string | null;
  suggestedMonthlySavingAmount: string | null;
}

export function normalizeMonthItem(item: SavingsProductPlanItemOut): NormalizedItem {
  return {
    id: item.id,
    name: item.name,
    product_type: item.product_type,
    detailText: `계획 ${formatKrw(item.planned)} · 이번 달 실제 ${formatKrw(item.actual)}`,
    pct: item.pct,
    status: item.status,
    planned: item.planned,
    suggestedMonthlySavingAmount: item.suggested_monthly_saving_amount,
  };
}

export function normalizeAnnualItem(item: SavingsProductAnnualPlanItemOut): NormalizedItem {
  return {
    id: item.id,
    name: item.name,
    product_type: item.product_type,
    detailText: `지금까지 목표 ${formatKrw(item.target_to_date)} · 올해 누적 ${formatKrw(item.actual)} (연간목표 ${formatKrw(item.annual_target)})`,
    pct: item.pct,
    status: item.status,
    planned: null,
    suggestedMonthlySavingAmount: null,
  };
}

export function groupHeaderText(summary: SavingsProductPlanGroupOut | SavingsProductAnnualPlanGroupOut): string {
  // "annual_target"는 연간 뷰 그룹에만 있는 필드 — `in`으로 타입을 좁혀 캐스트 없이 분기한다.
  if ("annual_target" in summary) {
    return `연간목표 ${formatKrw(summary.annual_target)} · 지금까지 목표 ${formatKrw(summary.target_to_date)}`;
  }
  return `계획 ${formatKrw(summary.planned)}`;
}
