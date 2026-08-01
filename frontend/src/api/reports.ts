import { apiGet } from "@/api/client";
import type { CategoryTrendOut, YearlyReportOut } from "@/types";

export const fetchYearlyReport = (year: number) =>
  apiGet<YearlyReportOut>("/reports/yearly", { params: { year } });

export const fetchCategoryTrend = (months = 6) =>
  apiGet<CategoryTrendOut>("/reports/category-trend", { params: { months } });
