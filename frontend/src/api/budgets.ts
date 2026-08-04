import { apiGet, apiPost, apiPut } from "@/api/client";
import type { BudgetCopyResultOut, BudgetListOut, BudgetUpsertIn } from "@/types";

export const fetchBudgets = (yearMonth: string) =>
  apiGet<BudgetListOut>("/budgets", { params: { year_month: yearMonth } });

export const upsertBudget = (payload: BudgetUpsertIn) => apiPut<BudgetListOut>("/budgets", payload);

export const copyPreviousMonthBudget = (yearMonth: string) =>
  apiPost<BudgetCopyResultOut>("/budgets/copy-previous-month", { year_month: yearMonth });
