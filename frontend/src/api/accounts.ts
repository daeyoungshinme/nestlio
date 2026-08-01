import { apiGet, apiPost } from "@/api/client";
import type { AccountCreateIn, AccountOut, AccountWithBalanceOut } from "@/types";

export const fetchAccounts = () => apiGet<AccountWithBalanceOut[]>("/accounts");

export const createAccount = (payload: AccountCreateIn) => apiPost<AccountOut>("/accounts", payload);

export const deactivateAccount = (id: number) => apiPost(`/accounts/${id}/deactivate`);
