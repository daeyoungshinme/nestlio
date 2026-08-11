import { apiGet, apiPost } from "@/api/client";
import type { GrowlioRealEstateOut, RealEstateGrowlioImportIn, RealEstateImportResultOut } from "@/types";

export const fetchGrowlioRealEstate = () => apiGet<GrowlioRealEstateOut[]>("/real-estate/growlio-accounts");

export const importGrowlioRealEstate = (payload: RealEstateGrowlioImportIn) =>
  apiPost<RealEstateImportResultOut[]>("/real-estate/growlio-import", payload);

export const syncRealEstate = (savingsProductId: number) =>
  apiPost<RealEstateImportResultOut>(`/real-estate/${savingsProductId}/sync`);
