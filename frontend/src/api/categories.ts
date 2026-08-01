import { apiGet, apiPost, apiPut } from "@/api/client";
import type { CategoryCreateIn, CategoryOut, CategoryUpdateIn } from "@/types";

export const fetchCategories = (kind?: "income" | "expense") =>
  apiGet<CategoryOut[]>("/categories", kind ? { params: { kind } } : undefined);

export const createCategory = (payload: CategoryCreateIn) => apiPost<CategoryOut>("/categories", payload);

export const updateCategory = (id: number, payload: CategoryUpdateIn) =>
  apiPut<CategoryOut>(`/categories/${id}`, payload);

export const deactivateCategory = (id: number) => apiPost(`/categories/${id}/deactivate`);
