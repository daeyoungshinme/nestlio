from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class SavingsProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    current_balance: Decimal
    monthly_saving_amount: Decimal
    sort_order: int
    is_active: bool


class SavingsProductCreateIn(BaseModel):
    name: str
    current_balance: Decimal = Decimal("0")
    monthly_saving_amount: Decimal = Decimal("0")


class SavingsProductUpdateIn(BaseModel):
    name: str
    current_balance: Decimal
    monthly_saving_amount: Decimal
