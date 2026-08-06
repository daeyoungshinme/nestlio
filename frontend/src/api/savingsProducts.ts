import { apiGet, apiPost, apiPut } from "@/api/client";
import type {
  GrowlioAccountOut,
  SavingsProductCreateIn,
  SavingsProductGrowlioImportIn,
  SavingsProductGrowlioLinkIn,
  SavingsProductOut,
  SavingsProductUpdateIn,
} from "@/types";

export const fetchSavingsProducts = () => apiGet<SavingsProductOut[]>("/savings-products");

export const createSavingsProduct = (payload: SavingsProductCreateIn) =>
  apiPost<SavingsProductOut>("/savings-products", payload);

export const updateSavingsProduct = (id: number, payload: SavingsProductUpdateIn) =>
  apiPut<SavingsProductOut>(`/savings-products/${id}`, payload);

export const deactivateSavingsProduct = (id: number) => apiPost(`/savings-products/${id}/deactivate`);

export const fetchGrowlioAccounts = () => apiGet<GrowlioAccountOut[]>("/savings-products/growlio-accounts");

export const setGrowlioLink = (id: number, payload: SavingsProductGrowlioLinkIn) =>
  apiPut<SavingsProductOut>(`/savings-products/${id}/growlio-link`, payload);

export const syncSavingsProduct = (id: number) => apiPost<SavingsProductOut>(`/savings-products/${id}/sync`);

export const importGrowlioAccounts = (payload: SavingsProductGrowlioImportIn) =>
  apiPost<SavingsProductOut[]>("/savings-products/growlio-import", payload);
