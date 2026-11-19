import { CATEGORY_SWATCH_FALLBACK_COLOR } from "@/utils/colors";
import type { CategoryAmountOut } from "@/types";

export interface PieSlice {
  name: string;
  value: number;
  color: string;
}

/** 카테고리 지출을 큰 순으로 상위 `topCount`개 + 나머지 합 "기타" 한 조각으로 묶는다 — 카테고리가 10~15개면 범례가
 * 화면 하나를 차지한다. 나머지가 한 개뿐이면 "기타"로 바꿔 봐야 줄어드는 게 없어 그대로 둔다. */
export function groupTopCategories(breakdown: readonly CategoryAmountOut[], topCount: number): PieSlice[] {
  const rows = breakdown
    .map((row) => ({ name: row.name, value: Number(row.amount), color: row.color }))
    .sort((a, b) => b.value - a.value);
  if (rows.length <= topCount + 1) return rows;
  const rest = rows.slice(topCount).reduce((sum, row) => sum + row.value, 0);
  return [...rows.slice(0, topCount), { name: "기타", value: rest, color: CATEGORY_SWATCH_FALLBACK_COLOR }];
}
