/** 가계부 목록 필터 값 — 필터 바(TransactionFilterBar)와 필터 로직(useLedgerFilters)이 공유한다. */
export type TopFilter = "all" | "income" | "expense" | "savings";
export type ExpenseTypeFilter = "all" | "fixed" | "variable" | "irregular";
export type UserFilter = string;
