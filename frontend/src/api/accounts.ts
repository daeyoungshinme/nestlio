import { apiGet, apiPost, apiPut } from "@/api/client";
import type {
  AccountCreateIn,
  GrowlioImportIn,
  AccountOut,
  AccountUpdateIn,
  AccountWithBalanceOut,
  GrowlioAccountOut,
  GrowlioSyncAllOut,
} from "@/types";

export const fetchAccounts = () => apiGet<AccountWithBalanceOut[]>("/accounts");

export const createAccount = (payload: AccountCreateIn) => apiPost<AccountOut>("/accounts", payload);

export const updateAccount = (id: number, payload: AccountUpdateIn) =>
  apiPut<AccountOut>(`/accounts/${id}`, payload);

export const deactivateAccount = (id: number) => apiPost(`/accounts/${id}/deactivate`);

export const syncAccount = (id: number) => apiPost<AccountOut>(`/accounts/${id}/sync`);

export const syncAllAccounts = () => apiPost<GrowlioSyncAllOut>("/accounts/sync-all");

export const fetchGrowlioAccounts = () => apiGet<GrowlioAccountOut[]>("/accounts/growlio-accounts");

export const importGrowlioAccounts = (payload: GrowlioImportIn) =>
  apiPost<AccountOut[]>("/accounts/growlio-import", payload);
