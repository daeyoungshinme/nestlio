export const QUERY_KEYS = {
  dashboard: (period: string, anchor: string) => ["dashboard", period, anchor] as const,
  /** Prefix for invalidating every dashboard period variant at once. */
  dashboardAll: ["dashboard"] as const,
  monthlyRetrospective: ["monthly-retrospective"] as const,
  categories: (kind?: "income" | "expense") => ["categories", kind ?? "all"] as const,
  /** Prefix for invalidating every categories kind variant at once. */
  categoriesAll: ["categories"] as const,
  transactions: (filters: Record<string, string | number | undefined>) =>
    ["transactions", filters] as const,
  /** Prefix for invalidating every transactions filter variant at once. */
  transactionsAll: ["transactions"] as const,
  recentTransactions: (filters: Record<string, string | number | boolean | undefined>) =>
    ["recent-transactions", filters] as const,
  categoryBreakdown: (filters: Record<string, string | number | undefined>) =>
    ["category-breakdown", filters] as const,
  /** Prefix for invalidating every category-breakdown filter variant at once. */
  categoryBreakdownAll: ["category-breakdown"] as const,
  transaction: (id: number) => ["transaction", id] as const,
  events: (dateFrom: string, dateTo: string) => ["events", dateFrom, dateTo] as const,
  /** Prefix for invalidating every events date-range variant at once. */
  eventsAll: ["events"] as const,
  accounts: ["accounts"] as const,
  yearlyReport: (year: number) => ["yearly-report", year] as const,
  categoryTrend: (months: number) => ["category-trend", months] as const,
  settings: ["settings"] as const,
  me: ["me"] as const,
  users: ["users"] as const,
  invites: ["invites"] as const,
  inviteToken: (token: string) => ["invite-token", token] as const,
  cashflowPlan: (yearMonth: string) => ["cashflow-plan", yearMonth] as const,
  budgets: (yearMonth: string) => ["budgets", yearMonth] as const,
  financialGoals: ["financial-goals"] as const,
  annualSavingsGoals: ["annual-savings-goals"] as const,
  annualSavingsGoalSuggestion: ["annual-savings-goals", "suggestion"] as const,
  challenges: ["challenges"] as const,
  savingsProducts: ["savings-products"] as const,
  growlioInvestmentAccounts: ["growlio-accounts", "savings-products"] as const,
  growlioBankAccounts: ["growlio-accounts", "accounts"] as const,
  growlioRealEstateAccounts: ["growlio-accounts", "real-estate"] as const,
  growlioInvestmentGoal: ["growlio-accounts", "investment-goal"] as const,
  loans: ["loans"] as const,
  netWorth: ["net-worth"] as const,
  recurring: ["recurring"] as const,
  notifications: ["notifications"] as const,
};
