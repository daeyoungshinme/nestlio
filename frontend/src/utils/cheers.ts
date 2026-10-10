import type { NotificationListOut, NotificationReactionOut } from "@/types";

/** 배우자의 응원이 붙는 알림 종류 — 마일스톤·챌린지 성공 축하에 남긴 반응, 목표 상세에서 직접 보낸 응원(goal_cheer —
 * 보낸 사람의 이모지·메시지가 그 알림의 리액션으로 저장된다), 배우자 저축 기록(partner_saving)에 남긴 반응. */
export const CHEER_NOTIF_TYPES = new Set(["goal_milestone", "challenge_success", "goal_cheer", "partner_saving"]);

/** 알림함에서 바로 응원 반응을 남길 수 있는 종류(goal_cheer는 응원 그 자체라 제외). */
export const REACTABLE_NOTIF_TYPES = new Set(["goal_milestone", "challenge_success", "partner_saving"]);

/** 배우자가 남긴 가장 최근 응원 — 홈 Hero가 쓴다. 알림 인박스(헤더)와 같은 쿼리를 공유한다. */
export function latestPartnerCheer(
  notifications: NotificationListOut | undefined,
  myUserId: string | undefined,
): NotificationReactionOut | null {
  if (!notifications || !myUserId) return null;
  const cheers = notifications.items
    .filter((n) => CHEER_NOTIF_TYPES.has(n.notif_type))
    .flatMap((n) => n.reactions)
    .filter((r) => r.user_id !== myUserId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return cheers[0] ?? null;
}
