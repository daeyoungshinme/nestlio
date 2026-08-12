import type { FinancialGoalOut } from "@/types";
import { daysUntil } from "@/utils/goalStatus";

export const GOAL_SORT_LABELS = ["우선순위순", "마감임박순", "진행률순"] as const;
export type GoalSortLabel = (typeof GOAL_SORT_LABELS)[number];

function deadlineRank(goal: FinancialGoalOut): number {
  if (goal.target_date !== null) return daysUntil(goal.target_date);
  if (goal.target_age !== null) return Number.MAX_SAFE_INTEGER - 1;
  return Number.MAX_SAFE_INTEGER;
}

/** 활성 재무목표 목록 정렬 — 우선순위순(기본, 사용자가 직접 매긴 priority)/마감임박순(target_date
 * 있으면 D-day, 없이 target_age만 있으면 후순위, 둘 다 없으면 맨 뒤)/진행률순(낮은 목표,
 * 즉 도움이 더 필요한 목표가 먼저 오도록 오름차순). */
export function sortGoals(goals: FinancialGoalOut[], option: GoalSortLabel): FinancialGoalOut[] {
  const arr = goals.slice();
  if (option === "마감임박순") return arr.sort((a, b) => deadlineRank(a) - deadlineRank(b));
  if (option === "진행률순") return arr.sort((a, b) => Number(a.progress_pct) - Number(b.progress_pct));
  return arr.sort((a, b) => a.priority - b.priority);
}
