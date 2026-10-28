import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.account import AccountOut
from app.schemas.common import bounded_str

CardType = Literal["credit", "debit"]


class CardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    card_type: CardType
    payment_account_id: int | None = None
    payment_account: AccountOut | None = None
    owner_user_id: uuid.UUID | None = None
    is_active: bool
    sort_order: int


class CardWithUsageOut(BaseModel):
    card: CardOut
    # 결제계좌 없이 기록된 이 카드의 거래 수 — 수정 폼의 "지난 거래에도 적용" 안내용
    unlinked_transaction_count: int


class CardCreateIn(BaseModel):
    name: bounded_str(100)
    card_type: CardType
    payment_account_id: int | None = None
    owner_user_id: uuid.UUID | None = None


class CardUpdateIn(CardCreateIn):
    # 결제계좌 없이 기록된 이 카드의 지난 거래에도 결제계좌를 채운다(채우면 그 계좌 잔액이 그만큼 줄어든다)
    apply_to_unlinked: bool = False
