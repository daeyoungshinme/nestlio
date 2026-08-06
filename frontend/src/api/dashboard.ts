import { apiGet } from "@/api/client";
import type { DashboardOut, DashboardPeriod, MonthlyRetrospectiveOut } from "@/types";

export const fetchDashboard = (period: DashboardPeriod, anchor: string) => {
  const params: Record<string, string> = { period };
  if (period === "month") params.year_month = anchor;
  else params.date = anchor;
  return apiGet<DashboardOut>("/dashboard", { params });
};

export const fetchMonthlyRetrospective = () =>
  apiGet<MonthlyRetrospectiveOut>("/dashboard/monthly-retrospective");
