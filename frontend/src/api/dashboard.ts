import { apiGet } from "@/api/client";
import type { DashboardOut, DashboardPeriod, MonthlyRetrospectiveOut } from "@/types";

export const fetchDashboard = (period: DashboardPeriod) =>
  apiGet<DashboardOut>("/dashboard", { params: { period } });

export const fetchMonthlyRetrospective = () =>
  apiGet<MonthlyRetrospectiveOut>("/dashboard/monthly-retrospective");
