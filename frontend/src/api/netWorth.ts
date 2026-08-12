import { apiGet } from "@/api/client";
import type { NetWorthGrowlioUnlinkedOut, NetWorthOut } from "@/types";

export const fetchNetWorth = (months = 12) => apiGet<NetWorthOut>("/net-worth", { params: { months } });

export const fetchGrowlioUnlinkedNetWorth = () =>
  apiGet<NetWorthGrowlioUnlinkedOut>("/net-worth/growlio-unlinked");
