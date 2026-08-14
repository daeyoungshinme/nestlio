import { apiGet, apiPost, apiPut } from "@/api/client";
import type { RecurringCreateIn, RecurringListOut, RecurringOut, RecurringUpdateIn } from "@/types";

export const fetchRecurring = (params?: { include_inactive?: boolean }) =>
  apiGet<RecurringListOut>("/recurring", { params });

export const createRecurring = (payload: RecurringCreateIn) => apiPost<RecurringOut>("/recurring", payload);

export const updateRecurring = (id: number, payload: RecurringUpdateIn) =>
  apiPut<RecurringOut>(`/recurring/${id}`, payload);

export const deactivateRecurring = (id: number) => apiPost<void>(`/recurring/${id}/deactivate`);

export const reactivateRecurring = (id: number) => apiPost<RecurringOut>(`/recurring/${id}/reactivate`);
