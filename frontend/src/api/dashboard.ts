import { apiGet } from "@/api/client";
import type { DashboardOut, DashboardPeriod } from "@/types";

export const fetchDashboard = (period: DashboardPeriod) =>
  apiGet<DashboardOut>("/dashboard", { params: { period } });
