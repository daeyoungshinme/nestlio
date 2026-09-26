import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/api/client";
import type {
  FinancialGoalCreateIn,
  FinancialGoalOut,
  FinancialGoalUpdateIn,
  GoalCheerIn,
  GoalCheerOut,
  GrowlioGoalSettingsOut,
} from "@/types";

export const fetchGoals = () => apiGet<FinancialGoalOut[]>("/financial-goals");

export const fetchGrowlioGoalSettings = () => apiGet<GrowlioGoalSettingsOut>("/financial-goals/growlio-goal");

export const createGoal = (payload: FinancialGoalCreateIn) =>
  apiPost<FinancialGoalOut>("/financial-goals", payload);

export const updateGoal = (id: number, payload: FinancialGoalUpdateIn) =>
  apiPut<FinancialGoalOut>(`/financial-goals/${id}`, payload);

export const deleteGoal = (id: number) => apiDelete(`/financial-goals/${id}`);

export const updateGoalMonthlyTarget = (goalId: number, yearMonth: string, achievedAmount: string) =>
  apiPatch<FinancialGoalOut>(`/financial-goals/${goalId}/monthly-targets/${yearMonth}`, {
    achieved_amount: achievedAmount,
  });

/** 배우자에게 목표 응원을 보낸다 — 알림함에 남는다(notification_inbox_service.send_goal_cheer). */
export const cheerGoal = (goalId: number, payload: GoalCheerIn) =>
  apiPost<GoalCheerOut>(`/financial-goals/${goalId}/cheer`, payload);
