import type { CategoryType } from "@/types";

export const CATEGORY_TYPE_LABEL: Record<CategoryType, string> = {
  fixed: "고정지출",
  variable: "변동지출",
  irregular: "비정기지출",
};

export const CATEGORY_TYPE_ORDER: CategoryType[] = ["fixed", "variable", "irregular"];
