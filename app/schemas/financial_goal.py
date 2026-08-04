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
    primary_savings_product_id: int | None = None
    primary_savings_product_name: str | None = None


class FinancialGoalCreateIn(BaseModel):
    priority: int = 1
    name: str
    target_age: int | None = None
    required_amount: Decimal = Decimal("0")
    monthly_saving_amount: Decimal = Decimal("0")
    current_amount: Decimal = Decimal("0")
    primary_savings_product_id: int | None = None


class FinancialGoalUpdateIn(BaseModel):
    priority: int
    name: str
    target_age: int | None
    required_amount: Decimal
    monthly_saving_amount: Decimal
    current_amount: Decimal = Decimal("0")
    primary_savings_product_id: int | None = None
