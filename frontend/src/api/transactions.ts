import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import type {
  CategoryAmountOut,
  ImportResultOut,
  TransactionCreateIn,
  TransactionFilters,
  TransactionListOut,
  TransactionOut,
  TransactionUpdateIn,
} from "@/types";

export const fetchTransactions = (filters: TransactionFilters) =>
  apiGet<TransactionListOut>("/transactions", { params: filters });

export const fetchCategoryBreakdown = (filters: {
  date_from: string;
  date_to: string;
  type?: "income" | "expense";
}) => apiGet<CategoryAmountOut[]>("/transactions/category-breakdown", { params: filters });

export const fetchTransaction = (id: number) => apiGet<TransactionOut>(`/transactions/${id}`);

export const createTransaction = (payload: TransactionCreateIn) =>
  apiPost<TransactionOut>("/transactions", payload);

export const updateTransaction = (id: number, payload: TransactionUpdateIn) =>
  apiPut<TransactionOut>(`/transactions/${id}`, payload);

export const deleteTransaction = (id: number) => apiDelete(`/transactions/${id}`);

export const importTransactionsCsv = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return apiPost<ImportResultOut>("/transactions/import", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export function exportTransactionsCsvUrl(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  });
  const qs = params.toString();
  return `/api/v1/transactions/export.csv${qs ? `?${qs}` : ""}`;
}
