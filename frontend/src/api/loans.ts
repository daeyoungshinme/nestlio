import { apiGet, apiPost, apiPut } from "@/api/client";
import type { LoanCreateIn, LoanOut, LoanUpdateIn } from "@/types";

export const fetchLoans = () => apiGet<LoanOut[]>("/loans");

export const createLoan = (payload: LoanCreateIn) => apiPost<LoanOut>("/loans", payload);

export const updateLoan = (id: number, payload: LoanUpdateIn) => apiPut<LoanOut>(`/loans/${id}`, payload);

export const deactivateLoan = (id: number) => apiPost(`/loans/${id}/deactivate`);
