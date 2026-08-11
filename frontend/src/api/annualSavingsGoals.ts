import { apiDelete, apiGet, apiPut } from "@/api/client";
import type { AnnualSavingsGoalOut, AnnualSavingsGoalSuggestionOut, AnnualSavingsGoalUpsertIn } from "@/types";

export const fetchAnnualSavingsGoals = () => apiGet<AnnualSavingsGoalOut[]>("/annual-savings-goals");

export const fetchSuggestedAnnualSavingsGoal = () =>
  apiGet<AnnualSavingsGoalSuggestionOut>("/annual-savings-goals/suggestion");

export const upsertAnnualSavingsGoal = (year: number, payload: AnnualSavingsGoalUpsertIn) =>
  apiPut<AnnualSavingsGoalOut>(`/annual-savings-goals/${year}`, payload);

export const deleteAnnualSavingsGoal = (year: number) => apiDelete(`/annual-savings-goals/${year}`);
