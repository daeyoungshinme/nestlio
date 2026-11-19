import type { OwnerTotalsOut } from "@/types";

export interface CoupleContribution {
  /** 가구가 이번 기간 모은 돈 = 공통 포함 전원의 (수입 − 지출) 합. 합계가 적자일 때만 0. */
  total: number;
  /** 가장 많이 모은 배우자(공통 제외). 1명뿐이거나 동률이거나 아무도 저축하지 않았으면 null. */
  leaderName: string | null;
}

/** 홈 Hero·월초 회고가 공유하는 "함께 모은 돈 + 저축 리더" 계산.
 * 각자 몫을 0으로 자르고 더하면 공통 지출(대개 음수 몫)이 빠져 실제보다 크게 나온다 — 남편 수입 500만·공통 지출
 * 300만이면 "500만원 모았어요"가 됐다. 리더는 백엔드 `rank_owner_contributions`처럼 공통을 빼고 고른다. */
export function coupleContribution(ownerTotals: OwnerTotalsOut[]): CoupleContribution {
  const net = ownerTotals.reduce((sum, o) => sum + Number(o.savings), 0);
  const ranked = ownerTotals
    .filter((o) => o.owner_user_id !== null)
    .sort((a, b) => Number(b.savings) - Number(a.savings));
  const top = ranked[0];
  const hasLeader =
    ranked.length > 1 && top !== undefined && Number(top.savings) > 0 && Number(ranked[1].savings) < Number(top.savings);
  return { total: Math.max(0, net), leaderName: hasLeader ? top.display_name : null };
}
