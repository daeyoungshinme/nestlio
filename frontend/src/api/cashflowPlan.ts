import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import type {
  CashflowPlanCopyResultOut,
  CashflowPlanItemSplitIn,
  CashflowPlanItemUpsertIn,
  CashflowPlanLinkRecurringIn,
  CashflowPlanListOut,
  CashflowPlanSplitResultOut,
} from "@/types";

export const fetchCashflowPlan = (yearMonth: string) =>
  apiGet<CashflowPlanListOut>("/cashflow-plan", { params: { year_month: yearMonth } });

export const upsertCashflowPlanItem = (payload: CashflowPlanItemUpsertIn) =>
  apiPut<CashflowPlanListOut>("/cashflow-plan/items", payload);

export const splitCashflowPlanItem = (payload: CashflowPlanItemSplitIn) =>
  apiPost<CashflowPlanSplitResultOut>("/cashflow-plan/items/split", payload);

export const deleteCashflowPlanItem = (id: number) => apiDelete(`/cashflow-plan/items/${id}`);

export const copyPreviousMonthCashflowPlan = (yearMonth: string) =>
  apiPost<CashflowPlanCopyResultOut>("/cashflow-plan/copy-previous-month", { year_month: yearMonth });

export const linkCashflowPlanRecurring = (itemId: number, payload: CashflowPlanLinkRecurringIn) =>
  apiPost<CashflowPlanListOut>(`/cashflow-plan/items/${itemId}/link-recurring`, payload);
