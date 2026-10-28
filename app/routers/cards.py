from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.card import CardCreateIn, CardOut, CardUpdateIn, CardWithUsageOut
from app.services import card_service

router = APIRouter(prefix="/cards", tags=["cards"])


@router.get("", response_model=list[CardWithUsageOut])
def list_cards(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return card_service.list_with_usage(db)


@router.post("", response_model=CardOut, status_code=status.HTTP_201_CREATED)
def create_card(payload: CardCreateIn, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return card_service.create_card(
        db, payload.name, payload.card_type, payload.payment_account_id, payload.owner_user_id
    )


@router.put("/{card_id}", response_model=CardOut)
def update_card(
    card_id: int,
    payload: CardUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    card = card_service.update_card(
        db,
        card_id,
        payload.name,
        payload.card_type,
        payload.payment_account_id,
        payload.owner_user_id,
        apply_to_unlinked=payload.apply_to_unlinked,
    )
    if card is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="카드를 찾을 수 없습니다.")
    return card


@router.post("/{card_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate(card_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if not card_service.deactivate_card(db, card_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="카드를 찾을 수 없습니다.")
