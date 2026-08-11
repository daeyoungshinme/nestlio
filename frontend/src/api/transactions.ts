import { api, apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import type {
  CategoryAmountOut,
  ImportResultOut,
  SheetImportIn,
  TransactionCreateIn,
  TransactionFilters,
  TransactionListOut,
  TransactionOut,
  TransactionType,
  TransactionUpdateIn,
} from "@/types";

export const fetchTransactions = (filters: TransactionFilters) =>
  apiGet<TransactionListOut>("/transactions", { params: filters });

export const fetchCategoryBreakdown = (filters: {
  date_from: string;
  date_to: string;
  type?: "income" | "expense";
  user_id?: string;
}) => apiGet<CategoryAmountOut[]>("/transactions/category-breakdown", { params: filters });

export const fetchTransaction = (id: number) => apiGet<TransactionOut>(`/transactions/${id}`);

export const fetchRecentTransactions = (params: { type: TransactionType; is_savings?: boolean; limit?: number }) =>
  apiGet<TransactionOut[]>("/transactions/recent-items", { params });

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

export const importTransactionsFromSheet = (payload: SheetImportIn) =>
  apiPost<ImportResultOut>("/transactions/import-sheet", payload);

export const fetchTransactionsCsv = (filters: TransactionFilters) =>
  api
    .get<Blob>("/transactions/export.csv", { params: filters, responseType: "blob" })
    .then((r) => r.data);
