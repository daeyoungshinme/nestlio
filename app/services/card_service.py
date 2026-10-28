import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.constants.sort_order import DEFAULT_SORT_ORDER
from app.errors import InvalidInputError
from app.models.account import Account
from app.models.card import Card
from app.models.transaction import Transaction

# 카드 종류 → 거래의 payment_method(app/schemas/transaction.py PaymentMethod)
PAYMENT_METHOD_BY_CARD_TYPE = {"credit": "credit_card", "debit": "debit_card"}


class InvalidCardAccountError(InvalidInputError):
    pass


class CardNotFoundError(InvalidInputError):
    pass


def list_cards(db: Session, active_only: bool = True) -> list[Card]:
    query = db.query(Card)
    if active_only:
        query = query.filter(Card.is_active.is_(True))
    return query.order_by(Card.sort_order, Card.name).all()


def list_with_usage(db: Session) -> list[dict]:
    cards = list_cards(db)
    counts = dict(
        db.query(Transaction.card_id, func.count(Transaction.id))
        .filter(Transaction.card_id.in_([c.id for c in cards]), Transaction.account_id.is_(None))
        .group_by(Transaction.card_id)
        .all()
    ) if cards else {}
    return [{"card": card, "unlinked_transaction_count": counts.get(card.id, 0)} for card in cards]


def _validate_payment_account(db: Session, payment_account_id: int | None) -> None:
    if payment_account_id is None:
        return
    account = db.get(Account, payment_account_id)
    if account is None or not account.is_active:
        raise InvalidCardAccountError("결제계좌를 찾을 수 없습니다.")


def create_card(
    db: Session,
    name: str,
    card_type: str,
    payment_account_id: int | None,
    owner_user_id: uuid.UUID | None = None,
) -> Card:
    _validate_payment_account(db, payment_account_id)
    card = Card(
        name=name,
        card_type=card_type,
        payment_account_id=payment_account_id,
        owner_user_id=owner_user_id,
        sort_order=DEFAULT_SORT_ORDER,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def update_card(
    db: Session,
    card_id: int,
    name: str,
    card_type: str,
    payment_account_id: int | None,
    owner_user_id: uuid.UUID | None = None,
    apply_to_unlinked: bool = False,
) -> Card | None:
    """카드 정보를 바꾼다. 결제계좌·종류를 바꿔도 지난 거래의 계좌·결제수단은 그대로다(그 돈은 실제로 예전
    계좌에서 나갔다). apply_to_unlinked면 결제계좌 없이 기록된 이 카드의 거래(예전 카드 계좌에서 옮겨 온 것)에만
    결제계좌를 채운다."""
    card = db.get(Card, card_id)
    if card is None:
        return None
    _validate_payment_account(db, payment_account_id)
    card.name = name
    card.card_type = card_type
    card.payment_account_id = payment_account_id
    card.owner_user_id = owner_user_id
    if apply_to_unlinked and payment_account_id is not None:
        db.query(Transaction).filter(Transaction.card_id == card.id, Transaction.account_id.is_(None)).update(
            {Transaction.account_id: payment_account_id}, synchronize_session=False
        )
    db.commit()
    db.refresh(card)
    return card


def deactivate_card(db: Session, card_id: int) -> bool:
    """대상이 있으면 비활성화하고 True, 없으면 False (라우터가 404로 변환). 지난 거래의 카드 표시는 남는다."""
    card = db.get(Card, card_id)
    if card is None:
        return False
    card.is_active = False
    db.commit()
    return True


def get_active_card(db: Session, card_id: int) -> Card:
    """거래에 새로 지정할 카드. 없거나 비활성이면 CardNotFoundError."""
    card = db.get(Card, card_id)
    if card is None or not card.is_active:
        raise CardNotFoundError("결제카드를 찾을 수 없습니다.")
    return card
