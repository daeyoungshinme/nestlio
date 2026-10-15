import { apiGet } from "@/api/client";
import type { CategoryTrendOut, SavingsReviewOut, YearlyReportOut } from "@/types";

/** owner: 배우자 UUID | "shared"(공통) | undefined(가구 전체) */
export const fetchYearlyReport = (year: number, owner?: string) =>
  apiGet<YearlyReportOut>("/reports/yearly", { params: { year, owner } });

export const fetchCategoryTrend = (months = 6) =>
  apiGet<CategoryTrendOut>("/reports/category-trend", { params: { months } });

/** yearMonth를 비우면 백엔드 기본값(지난달). owner는 소비 점검에만 적용된다. */
export const fetchSavingsReview = (yearMonth?: string, owner?: string) =>
  apiGet<SavingsReviewOut>("/reports/savings-review", { params: { year_month: yearMonth, owner } });
