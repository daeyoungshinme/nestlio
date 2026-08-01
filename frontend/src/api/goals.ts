import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import type { FinancialGoalCreateIn, FinancialGoalOut, FinancialGoalUpdateIn } from "@/types";

export const fetchGoals = () => apiGet<FinancialGoalOut[]>("/financial-goals");

export const createGoal = (payload: FinancialGoalCreateIn) =>
  apiPost<FinancialGoalOut>("/financial-goals", payload);

export const updateGoal = (id: number, payload: FinancialGoalUpdateIn) =>
  apiPut<FinancialGoalOut>(`/financial-goals/${id}`, payload);

export const deleteGoal = (id: number) => apiDelete(`/financial-goals/${id}`);
