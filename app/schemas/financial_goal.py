from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class FinancialGoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    priority: int
    name: str
    target_age: int | None
    required_amount: Decimal
    monthly_saving_amount: Decimal
    current_amount: Decimal
    progress_pct: Decimal
    sort_order: int
    funding_source_ids: list[int] = []
    funding_source_names: list[str] = []


class FinancialGoalCreateIn(BaseModel):
    priority: int = 1
    name: str
    target_age: int | None = None
    required_amount: Decimal = Decimal("0")
    monthly_saving_amount: Decimal = Decimal("0")
    current_amount: Decimal = Decimal("0")
    savings_product_ids: list[int] = []


class FinancialGoalUpdateIn(BaseModel):
    priority: int
    name: str
    target_age: int | None
    required_amount: Decimal
    monthly_saving_amount: Decimal
    current_amount: Decimal = Decimal("0")
    savings_product_ids: list[int] = []
