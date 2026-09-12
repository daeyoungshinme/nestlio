import { apiGet } from "@/api/client";
import type { DashboardBootstrapOut } from "@/types";

export const fetchDashboardBootstrap = () => apiGet<DashboardBootstrapOut>("/dashboard/bootstrap");
