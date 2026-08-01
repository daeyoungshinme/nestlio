import { apiGet, apiPost, apiPut } from "@/api/client";
import type { SavingsProductCreateIn, SavingsProductOut, SavingsProductUpdateIn } from "@/types";

export const fetchSavingsProducts = () => apiGet<SavingsProductOut[]>("/savings-products");

export const createSavingsProduct = (payload: SavingsProductCreateIn) =>
  apiPost<SavingsProductOut>("/savings-products", payload);

export const updateSavingsProduct = (id: number, payload: SavingsProductUpdateIn) =>
  apiPut<SavingsProductOut>(`/savings-products/${id}`, payload);

export const deactivateSavingsProduct = (id: number) => apiPost(`/savings-products/${id}/deactivate`);
