import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/api/client";
import type {
  FinancialGoalCreateIn,
  FinancialGoalOut,
  FinancialGoalUpdateIn,
  GoalCheerIn,
  GoalCheerOut,
  GrowlioGoalInsightOut,
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

/** 목표 상세의 "투자 수익을 반영하면?" — growlio 실적 수익률 + 이 목표의 필요 수익률·프리셋별 필요 적립액.
 * growlio 미설정이면 501, 접속 실패면 502 — 호출부는 에러 시 카드를 숨긴다. */
export const fetchGoalGrowlioInsight = (goalId: number) =>
  apiGet<GrowlioGoalInsightOut>(`/financial-goals/${goalId}/growlio-insight`);
