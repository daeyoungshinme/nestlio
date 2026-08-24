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
  email_sent: boolean | null;
}

export interface InviteCreateIn {
  email: string;
}

export interface InviteAcceptIn {
  display_name: string;
}

export type CategoryType = "fixed" | "variable" | "irregular";

// app/constants/benchmark_groups.py의 BENCHMARK_GROUPS 키를 손으로 미러링.
export type BenchmarkGroup =
  | "food"
  | "housing"
  | "communication"
  | "transport"
  | "leisure"
  | "healthcare"
  | "education"
  | "insurance"
  | "other";

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
  benchmark_group: BenchmarkGroup | null;
}

export interface CategoryCreateIn {
  name: string;
  kind: "income" | "expense";
  type: CategoryType;
  color: string;
  benchmark_group?: BenchmarkGroup | null;
}

export type CategoryUpdateIn = CategoryCreateIn;

export interface AccountOut {
  id: number;
  name: string;
  account_type: "bank" | "cash" | "card";
  initial_balance: string;
  is_active: boolean;
  sort_order: number;
  growlio_account_id: string | null;
  last_synced_at: string | null;
  owner_user_id: string | null;
}

export interface AccountWithBalanceOut {
  account: AccountOut;
  balance: string;
}

export interface AccountCreateIn {
  name: string;
  account_type: "bank" | "cash" | "card";
  initial_balance: string;
  owner_user_id?: string | null;
}

export interface AccountUpdateIn {
  name: string;
  account_type: "bank" | "cash" | "card";
  current_balance: string;
  owner_user_id?: string | null;
}

export interface AccountGrowlioImportIn {
  growlio_account_ids: string[];
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

/** owner_user_id(거래가 실제로 속한 사람, null이면 "공통") 기준 집계 - user_id(기록자) 기준인
 * UserTotalsOut과는 다른 축이다. */
export interface OwnerTotalsOut {
  owner_user_id: string | null;
  display_name: string;
  income: string;
  expense: string;
  savings: string;
  savings_investment: string;
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

export interface OwnerOverspendHighlightOut {
  owner_user_id: string | null;
  display_name: string;
  category_name: string;
  amount: string;
  avg_amount: string;
  delta: string;
}

export interface DashboardOut {
  period: DashboardPeriod;
  start: string;
  end: string;
  totals: TotalsOut;
  owner_totals: OwnerTotalsOut[];
  expense_breakdown: CategoryAmountOut[];
  owner_overspend_highlights: OwnerOverspendHighlightOut[];
  category_benchmarks: CategoryBenchmarkRowOut[];
  trend: TrendRowOut[];
  insights: InsightOut[];
  current_ym: string;
  savings_streak_months: number;
  investable_surplus: string;
  surplus_allocation: SurplusAllocationOut;
}

export interface SurplusAllocationOut {
  emergency_fund_portion: string;
  investable_portion: string;
}

export interface MonthlyRetrospectiveOut {
  year_month: string;
  start: string;
  end: string;
  totals: TotalsOut;
  owner_totals: OwnerTotalsOut[];
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
  owner_user_id: string | null;
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
  owner_user_id?: string | null;
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
  q?: string;
}

export interface SkippedRowOut {
  line: number;
  row: string[];
  reason: string;
}

export interface ImportResultOut {
  created: number;
  skipped: SkippedRowOut[];
  created_ids: number[];
}

export interface SheetImportIn {
  mode: "public" | "oauth";
  sheet_url?: string;
  spreadsheet_id?: string;
  sheet_name?: string;
}

export interface BulkDeleteResultOut {
  deleted: number;
  failed: number[];
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

export interface CategoryBenchmarkRowOut {
  group: BenchmarkGroup;
  label: string;
  amount: string;
  pct: number;
  benchmark_pct: number;
  status: "ok" | "warn";
}

export interface YearlyReportOut {
  year: number;
  prev_year: number;
  next_year: number;
  monthly: YearlyMonthRowOut[];
  totals: TotalsOut;
  breakdown: CategoryAmountOut[];
  benchmark: CategoryBenchmarkRowOut[];
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
export type EventSource = "native" | "google_import";

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
  /** 담당자 - null이면 공동(두 사람 모두 담당) */
  assignee: UserOut | null;
  completed_at: string | null;
  source: EventSource;
  occurrence_start: string;
}

export interface EventListOut {
  items: EventOut[];
  recurring_due: RecurringOut[];
}

export interface EventImportResultOut {
  created: number;
  updated: number;
  skipped: number;
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
  assignee_id?: string | null;
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
  benchmark_food_warn_pct: number;
  benchmark_housing_warn_pct: number;
  benchmark_communication_warn_pct: number;
  benchmark_transport_warn_pct: number;
  benchmark_leisure_warn_pct: number;
  benchmark_healthcare_warn_pct: number;
  benchmark_education_warn_pct: number;
  benchmark_insurance_warn_pct: number;
}

export type CoachingThresholdsIn = CoachingThresholdsOut;

export interface NotificationPrefsOut {
  email_weekly: boolean;
  email_monthly: boolean;
  threshold_alert: boolean;
  goal_milestone: boolean;
  challenge_success: boolean;
  event_reminder: boolean;
}

export type NotificationPrefsIn = NotificationPrefsOut;

export interface SettingsOut {
  google_connected: boolean;
  notify_emails: string[];
  coaching_thresholds: CoachingThresholdsOut;
  notification_prefs: NotificationPrefsOut;
  couple_photo_url: string | null;
}

export interface NotifyEmailsIn {
  emails: string[];
}

export interface TestEmailResultOut {
  sent: boolean;
  message: string;
}

export type CashflowSection = "income" | "fixed" | "variable" | "irregular";

export interface CashflowPlanItemOut {
  id: number | null;
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
  /** 연간계획 월별 금액으로 자동 채워졌을 뿐 아직 저장된 적 없는 항목이면 true (id도 null). 수정해서
   * 저장하면 실제 항목이 되어 false로 바뀐다. */
  from_annual_plan: boolean;
  /** 가상 폴백 항목(from_annual_plan=true)은 원본 AnnualPlanItem.id — 같은 카테고리에 연간계획 항목이
   * 여러 개 있어도 항목별로 구분 가능한 유일한 값 (React key로 사용, CashflowPlanSectionPanel 참고). 폴백을
   * 수정/저장해 승격시키면 실제 행에도 이 값이 저장되어 계속 채워진 채로 조회된다 — 연간계획 항목 이름이
   * 나중에 바뀌어도 원본과의 연결을 유지하기 위함(upsertCashflowPlanItem 호출 시 그대로 실어 보낼 것). */
  annual_plan_item_id: number | null;
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
  annual_plan_item_id?: number | null;
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
  suggested_amount: string | null;
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
  suggested_amount: string | null;
}

export interface BudgetListOut {
  year_month: string;
  prev_month: string;
  next_month: string;
  rows: BudgetRowOut[];
}

export interface NotificationReactionOut {
  user_id: string;
  display_name: string;
  emoji: string;
  message: string | null;
  created_at: string;
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
  reactions: NotificationReactionOut[];
}

export interface NotificationListOut {
  items: NotificationOut[];
  unread_count: number;
}

export type FundingSourceType = "savings_product" | "account" | "loan";

export interface FundingSourceOut {
  type: FundingSourceType;
  id: number;
  name: string;
  amount: string;
}

export interface FundingSourceIn {
  type: FundingSourceType;
  id: number;
}

export type GoalKind = "goal" | "challenge";

export interface GoalMonthlyTargetOut {
  year_month: string;
  target_amount: string;
  achieved_amount: string;
  is_achieved: boolean;
  is_auto_computed: boolean;
}

export interface GoalMonthlyTargetIn {
  year_month: string;
  target_amount: string;
}

export interface FinancialGoalOut {
  id: number;
  kind: GoalKind;
  priority: number;
  name: string;
  description: string | null;
  target_age: number | null;
  target_date: string | null;
  required_amount: string;
  monthly_saving_amount: string;
  current_amount: string;
  progress_pct: string;
  sort_order: number;
  funding_sources: FundingSourceOut[];
  months_remaining: number | null;
  suggested_monthly_amount: string | null;
  weighted_return_rate_pct: string | null;
  projected_months_with_growth: number | null;
  // 아래 4개는 kind==="challenge"(단기 부부 챌린지)일 때만 의미가 있다.
  start_date: string | null;
  status: "active" | "succeeded";
  effective_status: "active" | "succeeded" | "expired" | null;
  created_by_id: string | null;
  completed_at: string | null;
  // kind==="goal"이면서 미연동(funding_sources 없음)일 때 월별 계획을 쓰면 채워진다.
  monthly_targets: GoalMonthlyTargetOut[];
}

export interface FinancialGoalCreateIn {
  kind?: GoalKind;
  priority: number;
  name: string;
  description?: string | null;
  target_age?: number | null;
  target_date?: string | null;
  required_amount: string;
  monthly_saving_amount: string;
  current_amount?: string;
  funding_sources?: FundingSourceIn[];
  start_date?: string | null;
  monthly_targets?: GoalMonthlyTargetIn[] | null;
}

export type FinancialGoalUpdateIn = Omit<FinancialGoalCreateIn, "kind">;

export interface GrowlioGoalSettingsOut {
  is_configured: boolean;
  goal_amount: number | null;
  goal_annual_return_pct: number | null;
  goal_start_date: string | null;
  goal_initial_amount: number | null;
  annual_deposit_goal: number | null;
  annual_dividend_goal: number | null;
}

export interface AnnualSavingsGoalMonthlyTargetOut {
  year_month: string;
  target_amount: string;
}

export interface AnnualSavingsGoalMonthlyTargetIn {
  year_month: string;
  target_amount: string;
}

export interface AnnualSavingsGoalOut {
  year: number;
  target_amount_krw: string;
  monthly_target_krw: string | null;
  monthly_targets: AnnualSavingsGoalMonthlyTargetOut[];
  updated_at: string;
  net_savings_ytd: string;
  annual_achievement_pct: string;
  current_month_savings: string;
  monthly_achievement_pct: string | null;
}

export interface AnnualSavingsGoalUpsertIn {
  monthly_targets: AnnualSavingsGoalMonthlyTargetIn[];
}

export interface AnnualSavingsGoalSuggestionOut {
  suggested_monthly_target_krw: string;
  suggested_annual_target_krw: string;
  goal_based_monthly_target_krw: string;
  goal_based_annual_target_krw: string;
}

export interface AnnualPlanItemMonthlyTargetOut {
  year_month: string;
  target_amount: string;
}

export interface AnnualPlanItemMonthlyTargetIn {
  year_month: string;
  target_amount: string;
}

export interface AnnualPlanItemOut {
  id: number;
  year: number;
  section: CashflowSection;
  owner_user_id: string | null;
  name: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  sort_order: number;
  updated_at: string;
  start_month: string;
  end_month: string;
  annual_target: string;
  monthly_targets: AnnualPlanItemMonthlyTargetOut[];
}

export interface AnnualPlanItemUpsertIn {
  id: number | null;
  year: number;
  section: CashflowSection;
  owner_user_id: string | null;
  name: string;
  category_id: number | null;
  sort_order: number;
  start_month: string;
  end_month: string;
  monthly_targets: AnnualPlanItemMonthlyTargetIn[];
}

export interface AnnualPlanSectionMonthOut {
  year_month: string;
  target_amount: string;
  actual: string | null;
  pct: number | null;
  status: "ok" | "warn" | "critical" | null;
}

export interface AnnualPlanSectionSummaryOut {
  section: CashflowSection;
  elapsed_months: number;
  annual_target: string;
  target_to_date: string;
  actual: string;
  pct: number | null;
  annual_pct: number | null;
  status: "ok" | "warn" | "critical" | null;
  monthly: AnnualPlanSectionMonthOut[];
}

export interface AnnualPlanSummaryOut {
  income: AnnualPlanSectionSummaryOut;
  fixed: AnnualPlanSectionSummaryOut;
  variable: AnnualPlanSectionSummaryOut;
  irregular: AnnualPlanSectionSummaryOut;
  expense_total: string;
  available: string;
}

export interface AnnualPlanListOut {
  year: number;
  items: AnnualPlanItemOut[];
  summary: AnnualPlanSummaryOut;
}

export interface AnnualCategoryBudgetRowOut {
  category_id: number;
  name: string;
  type: "fixed" | "variable" | "irregular";
  color: string;
  budget: string;
  actual: string;
  pct: number;
  status: "ok" | "warn" | "critical";
}

export type SavingsProductType = "savings" | "investment" | "real_estate" | "emergency_fund";

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
  owner_user_id: string | null;
  linked_goal_id: number | null;
  linked_goal_name: string | null;
  monthly_saving_amount_synced: boolean;
}

export interface SavingsProductCreateIn {
  name: string;
  current_balance: string;
  monthly_saving_amount: string;
  product_type: SavingsProductType;
  principal_amount?: string | null;
  owner_user_id?: string | null;
}

export type SavingsProductUpdateIn = SavingsProductCreateIn;

export interface SavingsProductGrowlioLinkIn {
  growlio_account_id: string | null;
  auto_sync_enabled: boolean;
}

export interface SavingsProductGrowlioImportIn {
  growlio_account_ids: string[];
}

export interface SavingsProductPlanItemOut {
  id: number;
  name: string;
  product_type: "savings" | "investment";
  planned: string;
  actual: string;
  pct: number;
  status: "ok" | "warn" | "critical";
  suggested_monthly_saving_amount: string | null;
}

export interface SavingsProductPlanGroupOut {
  planned: string;
  actual: string | null;
  pct: number | null;
  status: "ok" | "warn" | "critical" | null;
}

export interface SavingsProductPlanListOut {
  year_month: string;
  items: SavingsProductPlanItemOut[];
  savings: SavingsProductPlanGroupOut;
  investment: SavingsProductPlanGroupOut;
}

export interface SavingsProductAnnualPlanItemOut {
  id: number;
  name: string;
  product_type: "savings" | "investment";
  annual_target: string;
  target_to_date: string;
  actual: string;
  pct: number;
  status: "ok" | "warn" | "critical";
}

export interface SavingsProductAnnualPlanGroupOut {
  annual_target: string;
  target_to_date: string;
  actual: string | null;
  pct: number | null;
  annual_pct: number | null;
  status: "ok" | "warn" | "critical" | null;
}

export interface SavingsProductAnnualPlanListOut {
  year: number;
  elapsed_months: number;
  items: SavingsProductAnnualPlanItemOut[];
  savings: SavingsProductAnnualPlanGroupOut;
  investment: SavingsProductAnnualPlanGroupOut;
}

export interface SavingsProductAnnualPlanMonthlyTargetOut {
  year_month: string;
  target_amount: string;
}

export interface SavingsProductAnnualPlanMonthlyTargetIn {
  year_month: string;
  target_amount: string;
}

export interface SavingsProductAnnualPlanDetailOut {
  product_id: number;
  year: number;
  start_month: string;
  end_month: string;
  monthly_targets: SavingsProductAnnualPlanMonthlyTargetOut[];
}

export interface SavingsProductAnnualPlanUpsertIn {
  year: number;
  start_month: string;
  end_month: string;
  monthly_targets: SavingsProductAnnualPlanMonthlyTargetIn[];
}

export interface GrowlioAccountOut {
  id: string;
  name: string;
  asset_type: string;
  current_value_krw: number;
  as_of: string | null;
}

export interface GrowlioSyncFailureOut {
  id: number;
  name: string;
  reason: string;
}

export interface GrowlioSyncAllOut {
  synced_count: number;
  failed: GrowlioSyncFailureOut[];
}

export interface GrowlioRealEstateOut {
  id: string;
  name: string;
  address: string | null;
  property_type: string | null;
  market_value_krw: number;
  mortgage_balance_krw: number;
  net_equity_krw: number;
  purchase_price_krw: number | null;
  purchase_date: string | null;
  as_of: string | null;
}

export interface RealEstateGrowlioImportIn {
  growlio_account_ids: string[];
}

export interface RealEstateImportResultOut {
  savings_product: SavingsProductOut;
  loan: LoanOut | null;
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
  growlio_account_id: string | null;
  auto_sync_enabled: boolean;
  last_synced_at: string | null;
  owner_user_id: string | null;
}

export interface LoanCreateIn {
  name: string;
  balance: string;
  monthly_payment: string;
  origination_year_month?: string | null;
  term_months?: number | null;
  interest_rate?: string | null;
  repayment_method?: RepaymentMethod | null;
  owner_user_id?: string | null;
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

export interface NetWorthGrowlioUnlinkedOut {
  bank_total: string;
  investment_total: string;
  real_estate_total: string;
  real_estate_loan_total: string;
  net_total: string;
  item_count: number;
}
