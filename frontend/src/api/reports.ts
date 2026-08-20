import { apiGet } from "@/api/client";
import type { CategoryTrendOut, YearlyReportOut } from "@/types";

/** owner: 배우자 UUID | "shared"(공통) | undefined(가구 전체) */
export const fetchYearlyReport = (year: number, owner?: string) =>
  apiGet<YearlyReportOut>("/reports/yearly", { params: { year, owner } });

export const fetchCategoryTrend = (months = 6) =>
  apiGet<CategoryTrendOut>("/reports/category-trend", { params: { months } });
