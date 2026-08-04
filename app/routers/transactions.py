import logging
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import CategoryAmountOut
from app.schemas.transaction import (
    ImportResultOut,
    TransactionCreateIn,
    TransactionListOut,
    TransactionOut,
    TransactionUpdateIn,
)
from app.services import notification_service, transaction_service
from app.services.google_auth import is_connected
from app.utils.dates import month_bounds

router = APIRouter(prefix="/transactions", tags=["transactions"])
logger = logging.getLogger("transactions")


@router.get("", response_model=TransactionListOut)
def list_transactions(
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    type: Literal["income", "expense"] | None = None,
    user_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    default_from, default_to = month_bounds(date.today())
    df = date_from or default_from
    dt = date_to or default_to
    items = transaction_service.list_transactions(db, df, dt, category_id, type, user_id)
    totals = transaction_service.period_totals(db, df, dt)
    return {"items": items, "totals": totals}


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        tx = transaction_service.create_transaction(
            db,
            user_id=current_user.id,
            category_id=payload.category_id,
            type_=payload.type,
            amount=payload.amount,
            transaction_date=payload.transaction_date,
            description=payload.description,
            payment_method=payload.payment_method,
            account_id=payload.account_id,
            savings_product_id=payload.savings_product_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if payload.type == "expense" and is_connected():
        try:
            notification_service.check_and_alert_budget_threshold(db, payload.category_id)
        except Exception:
            logger.exception("예산 초과 알림 발송 실패 (거래는 정상 저장됨)")
    return tx


@router.get("/category-breakdown", response_model=list[CategoryAmountOut])
def category_breakdown(
    date_from: date | None = None,
    date_to: date | None = None,
    type: Literal["income", "expense"] = "expense",
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    default_from, default_to = month_bounds(date.today())
    df = date_from or default_from
    dt = date_to or default_to
    return transaction_service.category_breakdown(db, df, dt, type)


@router.get("/export.csv")
def export_csv(
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    type: Literal["income", "expense"] | None = None,
    user_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    default_from, default_to = month_bounds(date.today())
    df = date_from or default_from
    dt = date_to or default_to
    items = transaction_service.list_transactions(db, df, dt, category_id, type, user_id)
    csv_text = transaction_service.export_csv(items)
    return Response(
        content=csv_text.encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="transactions_{df}_{dt}.csv"'},
    )


@router.post("/import", response_model=ImportResultOut)
async def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp949")
    return transaction_service.import_csv(db, text, current_user.id)


@router.get("/{tx_id}", response_model=TransactionOut)
def get_transaction(tx_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    tx = transaction_service.get_transaction(db, tx_id)
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return tx


@router.put("/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int,
    payload: TransactionUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        tx = transaction_service.update_transaction(
            db,
            tx_id,
            amount=payload.amount,
            type=payload.type,
            category_id=payload.category_id,
            transaction_date=payload.transaction_date,
            description=payload.description,
            payment_method=payload.payment_method,
            account_id=payload.account_id,
            savings_product_id=payload.savings_product_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    return tx


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(tx_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    deleted = transaction_service.delete_transaction(db, tx_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
