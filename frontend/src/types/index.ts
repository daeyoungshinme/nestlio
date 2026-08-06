/** app/schemas/*.py를 손으로 옮긴 타입. 백엔드가 안정화되면
 * `npm run generate:api-types` (openapi-typescript)로 자동 생성 타입으로 대체할 수 있다. */

export interface UserOut {
  id: string;
  email: string;
  display_name: string;
}

export interface InviteOut {
  id: string;
  email: string;
  invited_by_id: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accept_url: string;
}

export interface InviteCreateIn {
  email: string;
}

export interface InviteAcceptIn {
  display_name: string;
}

export type CategoryType = "fixed" | "variable" | "irregular";

export interface CategoryOut {
  id: number;
  name: string;
  kind: "income" | "expense";
  type: CategoryType;
  color: string;
  icon: string | null;
  is_active: boolean;
  is_discretionary: boolean;
  is_debt: boolean;
  is_savings: boolean;
  sort_order: number;
}

export interface CategoryCreateIn {
  name: string;
  kind: "income" | "expense";
  type: CategoryType;
  color: string;
}

export type CategoryUpdateIn = CategoryCreateIn;

export interface AccountOut {
  id: number;
  name: string;
  account_type: "bank" | "cash" | "card";
  initial_balance: string;
  is_active: boolean;
  sort_order: number;
}

export interface AccountWithBalanceOut {
  account: AccountOut;
  balance: string;
}

export interface AccountCreateIn {
  name: string;
  account_type: "bank" | "cash" | "card";
  initial_balance: string;
}

export interface TotalsOut {
  income: string;
  expense: string;
  fixed: string;
  variable: string;
  irregular: string;
  savings: string;
}

export interface UserTotalsOut {
  user_id: string;
  display_name: string;
  income: string;
  expense: string;
  savings: string;
}

export interface CategoryAmountOut {
  category_id: number;
  name: string;
  color: string;
  type: CategoryType;
  amount: string;
}

export interface TrendRowOut {
  year_month: string;
  income: string;
  expense: string;
  fixed: string;
  variable: string;
  irregular: string;
}

export interface InsightOut {
  rule_code: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export type DashboardPeriod = "today" | "week" | "month";

export interface DashboardOut {
  period: DashboardPeriod;
  start: string;
  end: string;
  totals: TotalsOut;
  by_user: UserTotalsOut[];
  expense_breakdown: CategoryAmountOut[];
  trend: TrendRowOut[];
  insights: InsightOut[];
  current_ym: string;
  savings_streak_months: number;
  active_challenge: ChallengeOut | null;
}

export interface MonthlyRetrospectiveOut {
  year_month: string;
  start: string;
  end: string;
  totals: TotalsOut;
  by_user: UserTotalsOut[];
  top_categories: CategoryAmountOut[];
  insights: InsightOut[];
}

export type TransactionType = "income" | "expense";

export interface TransactionOut {
  id: number;
  type: TransactionType;
  amount: string;
  transaction_date: string;
  description: string | null;
  payment_method: string | null;
  account_id: number | null;
  savings_product_id: number | null;
  category: CategoryOut;
  account: AccountOut | null;
  savings_product: SavingsProductOut | null;
  user: UserOut;
  created_at: string;
  updated_at: string;
}

export interface TransactionCreateIn {
  amount: string;
  type: TransactionType;
  category_id: number;
  transaction_date: string;
  description?: string | null;
  payment_method?: string | null;
  account_id?: number | null;
  savings_product_id?: number | null;
}

export type TransactionUpdateIn = TransactionCreateIn;

export interface TransactionListOut {
  items: TransactionOut[];
  totals: TotalsOut;
}

export interface TransactionFilters {
  date_from?: string;
  date_to?: string;
  category_id?: number;
  type?: TransactionType;
  user_id?: string;
}

export interface SkippedRowOut {
  line: number;
  row: string[];
  reason: string;
}

export interface ImportResultOut {
  created: number;
  skipped: SkippedRowOut[];
}

export type RecurringFrequency = "weekly" | "monthly" | "yearly";

export interface RecurringOut {
  id: number;
  name: string;
  category_id: number;
  amount: string;
  type: TransactionType;
  frequency: RecurringFrequency;
  day_of_month: number | null;
  days_of_month: number[] | null;
  start_date: string;
  end_date: string | null;
  reminder_days_before: number;
  next_due_date: string;
  is_active: boolean;
  category: CategoryOut;
}

export interface RecurringListOut {
  items: RecurringOut[];
  upcoming: RecurringOut[];
}

export interface RecurringCreateIn {
  name: string;
  category_id: number;
  amount: string;
  type: TransactionType;
  frequency: RecurringFrequency;
  days_of_month?: number[] | null;
  start_date: string;
  end_date?: string | null;
  reminder_days_before?: number;
}

export interface RecurringUpdateIn {
  name?: string;
  category_id?: number;
  amount?: string;
  type?: TransactionType;
  frequency?: RecurringFrequency;
  days_of_month?: number[] | null;
  start_date?: string;
  end_date?: string | null;
  reminder_days_before?: number;
}

export interface YearlyMonthRowOut {
  year_month: string;
  income: string;
  expense: string;
  fixed: string;
  variable: string;
  irregular: string;
  savings: string;
}

export interface YearlyReportOut {
  year: number;
  prev_year: number;
  next_year: number;
  monthly: YearlyMonthRowOut[];
  totals: TotalsOut;
  breakdown: CategoryAmountOut[];
}

export interface CategoryTrendSeriesOut {
  category_id: number | null;
  name: string;
  color: string;
  amounts: string[];
}

export interface CategoryTrendOut {
  months: string[];
  series: CategoryTrendSeriesOut[];
}

export type EventFrequency = "once" | "weekly" | "monthly";

export interface EventOut {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  all_day: boolean;
  start_at: string;
  end_at: string | null;
  frequency: EventFrequency;
  recurrence_end_date: string | null;
  reminder_minutes_before: number | null;
  creator: UserOut;
  occurrence_start: string;
}

export interface EventListOut {
  items: EventOut[];
  recurring_due: RecurringOut[];
}

export interface EventCreateIn {
  title: string;
  description?: string | null;
  location?: string | null;
  all_day?: boolean;
  start_at: string;
  end_at?: string | null;
  frequency?: EventFrequency;
  recurrence_end_date?: string | null;
  reminder_minutes_before?: number | null;
}

export type EventUpdateIn = EventCreateIn;

export interface CoachingThresholdsOut {
  savings_rate_warn: number;
  savings_rate_critical: number;
  fixed_cost_ratio_warn: number;
  fixed_cost_ratio_critical: number;
  budget_warn_pct: number;
  budget_critical_pct: number;
  discretionary_ratio_warn: number;
  debt_ratio_warn: number;
}

export type CoachingThresholdsIn = CoachingThresholdsOut;

export interface SettingsOut {
  google_connected: boolean;
  notify_email_to: string;
  coaching_thresholds: CoachingThresholdsOut;
  emergency_fund_balance: string | null;
  couple_photo_url: string | null;
}

export interface TestEmailResultOut {
  sent: boolean;
  message: string;
}

export type CashflowSection = "income" | "fixed" | "variable" | "irregular";

export interface CashflowPlanItemOut {
  id: number;
  section: CashflowSection;
  year_month: string;
  owner_user_id: string | null;
  name: string;
  amount: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  sort_order: number;
  installment_no: number | null;
  installment_total: number | null;
  installment_total_amount: string | null;
  recurring_expense_id: number | null;
  recurring_active: boolean | null;
}

export interface CashflowPlanItemUpsertIn {
  id?: number | null;
  section: CashflowSection;
  year_month: string;
  owner_user_id?: string | null;
  name: string;
  amount: string;
  category_id?: number | null;
  sort_order?: number;
}

export interface CashflowPlanItemSplitIn {
  section: CashflowSection;
  owner_user_id?: string | null;
  name: string;
  total_amount: string;
  start_year_month: string;
  category_id?: number | null;
  sort_order?: number;
}

export interface CashflowPlanSplitResultOut {
  created: number;
}

export interface CashflowPlanSectionSummaryOut {
  planned: string;
  actual: string | null;
  pct: number | null;
  status: "ok" | "warn" | "critical" | null;
}

export interface CashflowPlanSummaryOut {
  income: CashflowPlanSectionSummaryOut;
  fixed: CashflowPlanSectionSummaryOut;
  variable: CashflowPlanSectionSummaryOut;
  irregular: CashflowPlanSectionSummaryOut;
  expense_total: string;
  available: string;
}

export interface CashflowPlanListOut {
  year_month: string;
  prev_month: string;
  next_month: string;
  items: CashflowPlanItemOut[];
  summary: CashflowPlanSummaryOut;
}

export interface CashflowPlanCopyResultOut {
  copied: number;
}

export interface CashflowPlanLinkRecurringIn {
  recurring_expense_id: number;
}

export interface BudgetRowOut {
  category_id: number;
  name: string;
  type: "fixed" | "variable" | "irregular";
  color: string;
  budget: string;
  actual: string;
  pct: number;
  status: "ok" | "warn" | "critical";
}

export interface BudgetListOut {
  year_month: string;
  prev_month: string;
  next_month: string;
  rows: BudgetRowOut[];
}

export interface NotificationOut {
  id: number;
  notif_type: string;
  related_type: string | null;
  related_id: number | null;
  year_month: string | null;
  sent_at: string;
  detail: string | null;
  is_read: boolean;
}

export interface NotificationListOut {
  items: NotificationOut[];
  unread_count: number;
}

export interface FinancialGoalOut {
  id: number;
  priority: number;
  name: string;
  target_age: number | null;
  required_amount: string;
  monthly_saving_amount: string;
  current_amount: string;
  progress_pct: string;
  sort_order: number;
  funding_source_ids: number[];
  funding_source_names: string[];
}

export interface FinancialGoalCreateIn {
  priority: number;
  name: string;
  target_age?: number | null;
  required_amount: string;
  monthly_saving_amount: string;
  current_amount?: string;
  savings_product_ids?: number[];
}

export type FinancialGoalUpdateIn = FinancialGoalCreateIn;

export interface ChallengeOut {
  id: number;
  title: string;
  description: string | null;
  target_amount: string;
  current_amount: string;
  progress_pct: string;
  start_date: string;
  end_date: string;
  status: "active" | "succeeded";
  effective_status: "active" | "succeeded" | "expired";
  created_by_id: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChallengeCreateIn {
  title: string;
  description?: string | null;
  target_amount: string;
  start_date: string;
  end_date: string;
}

export type ChallengeUpdateIn = ChallengeCreateIn;

export interface ChallengeProgressIn {
  current_amount: string;
}

export type SavingsProductType = "savings" | "investment";

export interface SavingsProductOut {
  id: number;
  name: string;
  current_balance: string;
  monthly_saving_amount: string;
  product_type: SavingsProductType;
  principal_amount: string | null;
  return_amount: string | null;
  return_rate_pct: string | null;
  sort_order: number;
  is_active: boolean;
  growlio_account_id: string | null;
  auto_sync_enabled: boolean;
  last_synced_at: string | null;
}

export interface SavingsProductCreateIn {
  name: string;
  current_balance: string;
  monthly_saving_amount: string;
  product_type: SavingsProductType;
  principal_amount?: string | null;
}

export type SavingsProductUpdateIn = SavingsProductCreateIn;

export interface SavingsProductGrowlioLinkIn {
  growlio_account_id: string | null;
  auto_sync_enabled: boolean;
}

export interface GrowlioAccountOut {
  id: string;
  name: string;
  asset_type: string;
  current_value_krw: number;
  as_of: string | null;
}

export type RepaymentMethod = "equal_payment" | "equal_principal" | "bullet" | "grace_period" | "other";

export interface LoanOut {
  id: number;
  name: string;
  balance: string;
  monthly_payment: string;
  origination_year_month: string | null;
  term_months: number | null;
  interest_rate: string | null;
  repayment_method: RepaymentMethod | null;
  sort_order: number;
  is_active: boolean;
}

export interface LoanCreateIn {
  name: string;
  balance: string;
  monthly_payment: string;
  origination_year_month?: string | null;
  term_months?: number | null;
  interest_rate?: string | null;
  repayment_method?: RepaymentMethod | null;
}

export type LoanUpdateIn = LoanCreateIn;

export interface NetWorthBreakdownOut {
  accounts_total: string;
  savings_total: string;
  loans_total: string;
  net_worth: string;
}

export interface NetWorthSnapshotOut {
  year_month: string;
  accounts_total: string;
  savings_total: string;
  loans_total: string;
  net_worth: string;
}

export interface NetWorthOut {
  current: NetWorthBreakdownOut;
  history: NetWorthSnapshotOut[];
}
