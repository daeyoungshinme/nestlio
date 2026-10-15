from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import CategoryAmountOut, CategoryBenchmarkRowOut, TotalsOut


class YearlyMonthRowOut(BaseModel):
    year_month: str
    income: Decimal
    expense: Decimal
    fixed: Decimal
    variable: Decimal
    irregular: Decimal
    savings: Decimal


class YearlyReportOut(BaseModel):
    year: int
    prev_year: int
    next_year: int
    monthly: list[YearlyMonthRowOut]
    totals: TotalsOut
    breakdown: list[CategoryAmountOut]
    benchmark: list[CategoryBenchmarkRowOut]


class CategoryTrendSeriesOut(BaseModel):
    category_id: int | None
    name: str
    color: str
    amounts: list[Decimal]


class CategoryTrendOut(BaseModel):
    months: list[str]
    series: list[CategoryTrendSeriesOut]


SavingOpportunityRule = Literal[
    "trend_up", "benchmark_excess", "chronic_overrun", "small_frequent", "subscription", "unregistered_recurring"
]


class SavingOpportunityOut(BaseModel):
    rule_code: SavingOpportunityRule
    severity: Literal["info", "warning", "critical"]
    category_id: int | None
    title: str
    detail: str
    current_monthly_amount: Decimal
    estimated_monthly_saving: Decimal
    related: list[str]


class SpendingReviewOut(BaseModel):
    year_month: str
    months_analyzed: int
    items: list[SavingOpportunityOut]
    total_estimated_monthly_saving: Decimal


InsuranceFindingRule = Literal[
    "insurance_ratio",
    "indemnity_duplicate",
    "coverage_overlap",
    "renewal_soon",
    "auto_renewal_soon",
    "savings_type",
    "payment_ending",
    "unregistered_premium",
    "over_coverage",
    "coverage_gap",
    "renewable_rider_share",
    "rider_premium_mismatch",
]


class InsuranceFindingOut(BaseModel):
    rule_code: InsuranceFindingRule
    severity: Literal["info", "warning", "critical"]
    title: str
    detail: str
    estimated_monthly_saving: Decimal
    policy_ids: list[int]


class InsuredPremiumOut(BaseModel):
    label: str
    monthly_premium: Decimal
    count: int


class CoverageStatusOut(BaseModel):
    insured_label: str
    coverage: str
    total_amount: Decimal
    target_amount: Decimal
    status: Literal["over", "ok", "gap", "no_target"]
    rider_count: int


class TopRiderOut(BaseModel):
    policy_name: str
    rider_name: str
    coverage: str
    monthly_premium: Decimal
    is_renewable: bool


class InsuranceSummaryOut(BaseModel):
    policies_count: int
    total_monthly_premium: Decimal
    protection_monthly_premium: Decimal
    savings_monthly_premium: Decimal
    avg_monthly_income: Decimal
    protection_income_pct: float | None
    guideline_pct: float
    by_insured: list[InsuredPremiumOut]
    coverage_table: list[CoverageStatusOut]
    top_riders: list[TopRiderOut]


class InsuranceReviewOut(BaseModel):
    summary: InsuranceSummaryOut
    findings: list[InsuranceFindingOut]
    total_estimated_monthly_saving: Decimal


class SavingsReviewOut(BaseModel):
    year_month: str
    spending: SpendingReviewOut
    insurance: InsuranceReviewOut
    total_estimated_monthly_saving: Decimal
