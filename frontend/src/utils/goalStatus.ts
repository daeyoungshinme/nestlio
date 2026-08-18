import type { FinancialGoalOut } from "@/types";
import type { ProgressStatus } from "@/utils/colors";

/** kind="challenge"(단기 부부 챌린지)의 effective_status(active/succeeded/expired)를 목표 카드가
 * 공유하는 ProgressStatus로 매핑한다 — 챌린지는 "월 저축 페이스"라는 개념이 없어 아래
 * computeGoalStatus의 suggested_monthly_amount 기반 판정을 쓰면 안 맞는다(적립 목표가 아니라
 * 기간제 미션이므로). */
function computeChallengeStatus(goal: FinancialGoalOut): ProgressStatus {
  if (goal.effective_status === "succeeded") return "achieved";
  if (goal.effective_status === "expired") return "expired";
  return "on_track";
}

/** kind="irregular"(기간제 비정기 지출 목표)도 챌린지처럼 "월 저축 페이스"라는 개념이 없다
 * (monthly_saving_amount가 항상 "0"으로 고정돼 있어 computeGoalStatus의 페이스 판정을 쓰면 안 됨) —
 * 대신 월별 계획(monthly_targets) 달성 여부가 이미 progress_pct에 반영되므로 진행률/기간 종료
 * 여부만으로 판정한다. */
function computeIrregularStatus(goal: FinancialGoalOut): ProgressStatus {
  if (Number(goal.progress_pct) >= 100) return "achieved";
  if (goal.target_date !== null && daysUntil(goal.target_date) < 0) return "behind";
  return "on_track";
}

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

/** 목표/챌린지/비정기목표를 함께 다루는 목록·카드에서 kind에 맞는 상태 판정으로 분기한다. */
export function computeCardStatus(goal: FinancialGoalOut): ProgressStatus {
  if (goal.kind === "challenge") return computeChallengeStatus(goal);
  if (goal.kind === "irregular") return computeIrregularStatus(goal);
  return computeGoalStatus(goal);
}

/** 활성 목록에서 걸러 "달성한 목표" 접이식으로 옮길지 판정. 챌린지는 status가 succeeded인지로
 * 판정한다(기간 종료만으로는 옮기지 않음 — 만료된 챌린지도 활성 목록에 남아 눈에 띄게 유지).
 * 비정기목표는 별도 완료 상태 필드가 없어 진행률 100%로 판정한다. */
export function isGoalAchieved(goal: FinancialGoalOut): boolean {
  if (goal.kind === "challenge") return goal.effective_status === "succeeded";
  if (goal.kind === "irregular") return Number(goal.progress_pct) >= 100;
  return computeGoalStatus(goal) === "achieved";
}
