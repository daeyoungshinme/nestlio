import type { FinancialGoalOut, GoalKind } from "@/types";
import { toast } from "@/utils/toast";

const GOAL_MILESTONES = [25, 50, 75, 100];

/** 저장 전후 진행률을 비교해 이번 저장으로 새로 넘어선 가장 높은 마일스톤을 반환한다 (없으면 null).
 * 챌린지는 실제 축하 이메일이 100%에서만 나가므로(app/services/notification_service.py) 프론트
 * 토스트도 100%만 축하한다 — 목표는 25/50/75/100% 전부 축하한다. */
export function crossedMilestone(oldPct: number, newPct: number, kind: GoalKind): number | null {
  const milestones = kind === "challenge" ? [100] : GOAL_MILESTONES;
  const crossed = milestones.filter((m) => oldPct < m && newPct >= m);
  return crossed.length > 0 ? Math.max(...crossed) : null;
}

/** 저장으로 마일스톤을 넘었으면 축하 토스트를 띄운다. */
export function celebrateIfCrossed(oldPct: number, goal: FinancialGoalOut) {
  const milestone = crossedMilestone(oldPct, Number(goal.progress_pct), goal.kind);
  if (milestone !== null) {
    const label = goal.kind === "challenge" ? "챌린지" : "목표";
    toast(`"${goal.name}" ${label} ${milestone}% 달성! 축하해요 🎉`, "success");
  }
}
