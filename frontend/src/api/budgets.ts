import { apiGet } from "@/api/client";
import type { BudgetListOut } from "@/types";

export const fetchBudgets = (yearMonth: string) =>
  apiGet<BudgetListOut>("/budgets", { params: { year_month: yearMonth } });
