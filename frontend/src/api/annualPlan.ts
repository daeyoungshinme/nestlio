import { apiDelete, apiGet, apiPut } from "@/api/client";
import type { AnnualCategoryBudgetRowOut, AnnualPlanItemUpsertIn, AnnualPlanListOut } from "@/types";

export const fetchAnnualPlan = (year: number) => apiGet<AnnualPlanListOut>("/annual-plan", { params: { year } });

export const upsertAnnualPlanItem = (payload: AnnualPlanItemUpsertIn) =>
  apiPut<AnnualPlanListOut>("/annual-plan/items", payload);

export const deleteAnnualPlanItem = (id: number) => apiDelete(`/annual-plan/items/${id}`);

export const fetchAnnualCategoryBudgets = (year: number) =>
  apiGet<AnnualCategoryBudgetRowOut[]>("/annual-plan/category-budgets", { params: { year } });
