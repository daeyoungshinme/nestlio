import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict

from app.schemas.account import AccountOut
from app.schemas.category import CategoryOut
from app.schemas.common import KrwAmount, TotalsOut
from app.schemas.savings_product import SavingsProductOut
from app.schemas.user import UserOut

PaymentMethod = Literal["cash", "credit_card", "debit_card", "transfer", "other"]


def _unknown_payment_method_to_other(v: object) -> object:
    if isinstance(v, str) and v not in ("cash", "credit_card", "debit_card", "transfer", "other"):
        return "other"
    return v


# DB의 payment_method 컬럼은 여전히 자유텍스트 String(50)이라, 이 필드를 Literal로 좁히기 전에
# 다른 값으로 저장된 기존 거래가 있으면 응답 직렬화가 실패한다(422가 아니라 500) — 출력 전용으로
# 미지 값을 "other"로 폴백한다. 입력 검증(TransactionCreateIn 등)은 여전히 PaymentMethod로
# 엄격하게 막는다.
PaymentMethodOut = Annotated[PaymentMethod, BeforeValidator(_unknown_payment_method_to_other)]


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: Literal["income", "expense"]
    amount: Decimal
    transaction_date: date
    description: str | None = None
    payment_method: PaymentMethodOut | None = None
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
    # 빈 문자열("")도 0으로 받는다 — 다른 *In 스키마와 동일 (app/schemas/common.py)
    amount: KrwAmount
    type: Literal["income", "expense"]
    category_id: int
    transaction_date: date
    description: str | None = None
    payment_method: PaymentMethod | None = None
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
    created_ids: list[int] = []


class SheetImportIn(BaseModel):
    mode: Literal["public", "oauth"]
    sheet_url: str | None = None  # mode == "public" 필수
    spreadsheet_id: str | None = None  # mode == "oauth" 필수
    sheet_name: str | None = None  # mode == "oauth"에서만 선택 사용


class BulkDeleteIn(BaseModel):
    ids: list[int]


class BulkDeleteResultOut(BaseModel):
    deleted: int
    failed: list[int]
