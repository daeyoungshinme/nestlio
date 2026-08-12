import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.account import AccountOut
from app.schemas.category import CategoryOut
from app.schemas.common import TotalsOut
from app.schemas.savings_product import SavingsProductOut
from app.schemas.user import UserOut


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: Literal["income", "expense"]
    amount: Decimal
    transaction_date: date
    description: str | None = None
    payment_method: str | None = None
    account_id: int | None = None
    savings_product_id: int | None = None
    category: CategoryOut
    account: AccountOut | None = None
    savings_product: SavingsProductOut | None = None
    user: UserOut
    owner_user_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class TransactionCreateIn(BaseModel):
    amount: Decimal
    type: Literal["income", "expense"]
    category_id: int
    transaction_date: date
    description: str | None = None
    payment_method: str | None = None
    account_id: int | None = None
    savings_product_id: int | None = None
    owner_user_id: uuid.UUID | None = None


class TransactionUpdateIn(TransactionCreateIn):
    pass


class TransactionListOut(BaseModel):
    items: list[TransactionOut]
    totals: TotalsOut


class SkippedRowOut(BaseModel):
    line: int
    row: list[str]
    reason: str


class ImportResultOut(BaseModel):
    created: int
    skipped: list[SkippedRowOut]


class SheetImportIn(BaseModel):
    mode: Literal["public", "oauth"]
    sheet_url: str | None = None  # mode == "public" 필수
    spreadsheet_id: str | None = None  # mode == "oauth" 필수
    sheet_name: str | None = None  # mode == "oauth"에서만 선택 사용
