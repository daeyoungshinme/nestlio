import type { CoachingThresholdsOut } from "@/types";

type ThresholdKey = keyof CoachingThresholdsOut;
/** 입력 중인 값 — 비운 칸은 ""로 둔다(Number("")가 0이라 그대로 저장하면 기준이 0%가 된다). */
export type ThresholdDraft = Record<ThresholdKey, number | "">;

/** 낮을수록 나쁜 지표(경고 > 위험)와 높을수록 나쁜 지표(경고 < 위험) — 백엔드 `config.threshold_order_errors`와 같은 쌍. */
const LOWER_IS_WORSE: [ThresholdKey, ThresholdKey, string][] = [["savings_rate_warn", "savings_rate_critical", "저축률"]];
const HIGHER_IS_WORSE: [ThresholdKey, ThresholdKey, string][] = [
  ["fixed_cost_ratio_warn", "fixed_cost_ratio_critical", "고정비율"],
  ["budget_warn_pct", "budget_critical_pct", "예산"],
];

/** 저장 전 검사 — 빈 칸, 0~100 범위, 경고/위험 순서. 문구 목록이 비면 저장해도 된다. */
export function coachingThresholdErrors(draft: ThresholdDraft): string[] {
  const errors: string[] = [];
  const values = Object.values(draft);
  if (values.some((v) => v === "")) errors.push("비어 있는 칸을 채워 주세요.");
  if (values.some((v) => v !== "" && (v < 0 || v > 100))) errors.push("0~100 사이로 입력해 주세요.");
  for (const [warn, crit, label] of LOWER_IS_WORSE) {
    const w = draft[warn];
    const c = draft[crit];
    if (w !== "" && c !== "" && !(w > c)) errors.push(`${label}은(는) 경고 값이 위험 값보다 커야 합니다.`);
  }
  for (const [warn, crit, label] of HIGHER_IS_WORSE) {
    const w = draft[warn];
    const c = draft[crit];
    if (w !== "" && c !== "" && !(w < c)) errors.push(`${label}은(는) 경고 값이 위험 값보다 작아야 합니다.`);
  }
  return errors;
}
