from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class BudgetRowOut(BaseModel):
    category_id: int
    name: str
    type: Literal["fixed", "variable", "irregular"]
    color: str
    budget: Decimal
    actual: Decimal
    pct: float
    status: Literal["ok", "warn", "critical"]


class BudgetListOut(BaseModel):
    year_month: str
    prev_month: str
    next_month: str
    rows: list[BudgetRowOut]


class BudgetUpsertIn(BaseModel):
    year_month: str
    category_id: int
    amount: Decimal


class BudgetCopyIn(BaseModel):
    year_month: str


class BudgetCopyResultOut(BaseModel):
    copied: int
