import { apiGet } from "@/api/client";
import type { NetWorthOut } from "@/types";

export const fetchNetWorth = (months = 12) => apiGet<NetWorthOut>("/net-worth", { params: { months } });
