import type { OwnerTotalsOut } from "@/types";

export interface CoupleContribution {
  /** 부부(공통 포함)가 이번 기간 모은 돈 — 음수(적자)인 사람은 0으로 본다. */
  total: number;
  /** 가장 많이 모은 사람. 1명뿐이거나 동률이거나 아무도 저축하지 않았으면 null. */
  leaderName: string | null;
}

/** 홈 Hero·월초 회고가 공유하는 "함께 모은 돈 + 저축 리더" 계산(구 CoupleContributionCard에서 옮김). */
export function coupleContribution(ownerTotals: OwnerTotalsOut[]): CoupleContribution {
  const ranked = ownerTotals.slice().sort((a, b) => Number(b.savings) - Number(a.savings));
  const total = ranked.reduce((sum, o) => sum + Math.max(0, Number(o.savings)), 0);
  const top = ranked[0];
  const hasLeader = ranked.length > 1 && top !== undefined && Number(top.savings) > 0 && Number(ranked[1].savings) < Number(top.savings);
  return { total, leaderName: hasLeader ? top.display_name : null };
}
