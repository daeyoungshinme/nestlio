export const QUERY_KEYS = {
  dashboard: (period: string) => ["dashboard", period] as const,
  categories: (kind?: "income" | "expense") => ["categories", kind ?? "all"] as const,
  transactions: (filters: Record<string, string | number | undefined>) =>
    ["transactions", filters] as const,
  categoryBreakdown: (filters: Record<string, string | number | undefined>) =>
    ["category-breakdown", filters] as const,
  transaction: (id: number) => ["transaction", id] as const,
  events: (dateFrom: string, dateTo: string) => ["events", dateFrom, dateTo] as const,
  accounts: ["accounts"] as const,
  yearlyReport: (year: number) => ["yearly-report", year] as const,
  categoryTrend: (months: number) => ["category-trend", months] as const,
  settings: ["settings"] as const,
  me: ["me"] as const,
  users: ["users"] as const,
  cashflowPlan: (yearMonth: string) => ["cashflow-plan", yearMonth] as const,
  financialGoals: ["financial-goals"] as const,
  savingsProducts: ["savings-products"] as const,
  loans: ["loans"] as const,
  netWorth: ["net-worth"] as const,
};
