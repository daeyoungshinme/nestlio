import { apiGet, apiPost } from "@/api/client";
import type { GrowlioPushFailedOut, GrowlioPushRetryOut, NetWorthGrowlioUnlinkedOut, NetWorthOut } from "@/types";

export const fetchNetWorth = (months = 12) => apiGet<NetWorthOut>("/net-worth", { params: { months } });

export const fetchGrowlioUnlinkedNetWorth = () =>
  apiGet<NetWorthGrowlioUnlinkedOut>("/net-worth/growlio-unlinked");

export const fetchFailedGrowlioPushes = () => apiGet<GrowlioPushFailedOut[]>("/net-worth/growlio-pushes/failed");

export const retryGrowlioPush = (id: number) =>
  apiPost<GrowlioPushRetryOut>(`/net-worth/growlio-pushes/${id}/retry`);
