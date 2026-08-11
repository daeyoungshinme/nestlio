import type { FinancialGoalOut } from "@/types";
import type { ProgressStatus } from "@/utils/colors";

/** 오늘부터 목표일까지 남은 일수 (음수면 이미 지난 목표일). */
export function daysUntil(targetDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** 목표 하나의 진행 상태를 판정한다. 백엔드가 이미 계산해 내려주는 progress_pct/target_date/
 * suggested_monthly_amount만으로 프론트에서 계산하며 별도 백엔드 필드를 추가하지 않는다.
 * monthly_saving_amount가 suggested_monthly_amount의 90% 이상이면 정상으로 본다 — 반올림
 * 오차로 아주 살짝 못 미칠 때마다 "지연"으로 뒤집히는 것을 막기 위한 슬랙. */
export function computeGoalStatus(goal: FinancialGoalOut): ProgressStatus {
  if (Number(goal.progress_pct) >= 100) return "achieved";
  if (goal.target_date !== null && daysUntil(goal.target_date) < 0) return "behind";
  if (goal.suggested_monthly_amount === null) return "neutral";
  const requiredPace = Number(goal.suggested_monthly_amount) * 0.9;
  return Number(goal.monthly_saving_amount) >= requiredPace ? "on_track" : "behind";
}
