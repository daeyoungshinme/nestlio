from decimal import Decimal

from pydantic import BaseModel

from app.schemas.common import CategoryAmountOut, TotalsOut


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


class CategoryTrendSeriesOut(BaseModel):
    category_id: int | None
    name: str
    color: str
    amounts: list[Decimal]


class CategoryTrendOut(BaseModel):
    months: list[str]
    series: list[CategoryTrendSeriesOut]
