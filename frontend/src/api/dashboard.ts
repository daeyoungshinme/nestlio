import { apiGet } from "@/api/client";
import type { DashboardOut, MonthlyRetrospectiveOut } from "@/types";

export const fetchDashboard = (yearMonth: string) =>
  apiGet<DashboardOut>("/dashboard", { params: { year_month: yearMonth } });

export const fetchMonthlyRetrospective = () =>
  apiGet<MonthlyRetrospectiveOut>("/dashboard/monthly-retrospective");
