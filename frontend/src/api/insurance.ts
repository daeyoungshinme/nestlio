import { apiGet, apiPost, apiPut } from "@/api/client";
import type { InsurancePolicyIn, InsurancePolicyOut } from "@/types";

export const fetchInsurancePolicies = () => apiGet<InsurancePolicyOut[]>("/insurance-policies");

export const createInsurancePolicy = (payload: InsurancePolicyIn) =>
  apiPost<InsurancePolicyOut>("/insurance-policies", payload);

export const updateInsurancePolicy = (id: number, payload: InsurancePolicyIn) =>
  apiPut<InsurancePolicyOut>(`/insurance-policies/${id}`, payload);

export const deactivateInsurancePolicy = (id: number) => apiPost(`/insurance-policies/${id}/deactivate`);
