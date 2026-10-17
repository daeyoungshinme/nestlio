import logging
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.common import CategoryAmountOut
from app.schemas.transaction import (
    BulkDeleteIn,
    BulkDeleteResultOut,
    ImportResultOut,
    TransactionCreateIn,
    TransactionListOut,
    TransactionOut,
    TransactionUpdateIn,
)
from app.services import (
    notification_inbox_service,
    notification_service,
    transaction_import_service,
    transaction_report_service,
    transaction_service,
)
from app.utils.dates import today_kst

router = APIRouter(prefix="/transactions", tags=["transactions"])
logger = logging.getLogger("transactions")
# 검색어는 거래 내역·카테고리명 LIKE 검색에만 쓴다 — 무제한이면 긴 문자열이 그대로 쿼리에 실린다.
SEARCH_QUERY_MAX_LENGTH = 100


@router.get("", response_model=TransactionListOut)
def list_transactions(
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    type: Literal["income", "expense"] | None = None,
    user_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=SEARCH_QUERY_MAX_LENGTH),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return transaction_service.list_with_totals(
        db, today_kst(), date_from, date_to, category_id=category_id, type_=type, user_id=user_id, q=q
    )


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreateIn,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    bearer_token: str = Depends(get_bearer_token),
):
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
        owner_user_id=payload.owner_user_id,
        bearer_token=bearer_token,
    )
    notification_service.alert_budget_after_transaction_save(db, tx)
    notification_inbox_service.log_partner_saving_best_effort(db, current_user, tx)
    if tx.growlio_sync_failed:
        response.headers["X-Growlio-Sync-Warning"] = "1"
    return tx


@router.get("/category-breakdown", response_model=list[CategoryAmountOut])
def category_breakdown(
    date_from: date | None = None,
    date_to: date | None = None,
    type: Literal["income", "expense"] = "expense",
    user_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    df, dt = transaction_service.period_or_this_month(date_from, date_to, today_kst())
    return transaction_report_service.category_breakdown(db, df, dt, type, user_id)


@router.get("/recent-items", response_model=list[TransactionOut])
def recent_items(
    type: Literal["income", "expense"],
    is_savings: bool = False,
    limit: int = 8,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return transaction_service.frequent_unique_transactions(db, type, today_kst(), is_savings, limit)


@router.get("/export.csv")
def export_csv(
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    type: Literal["income", "expense"] | None = None,
    user_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=SEARCH_QUERY_MAX_LENGTH),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    df, dt = transaction_service.period_or_this_month(date_from, date_to, today_kst())
    items = transaction_service.list_transactions(db, df, dt, category_id, type, user_id, q=q)
    csv_text = transaction_import_service.export_csv(items)
    return Response(
        content=csv_text.encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="transactions_{df}_{dt}.csv"'},
    )


@router.post("/import", response_model=ImportResultOut)
def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # async def가 아니라 def — 가져오기 전체가 동기 DB 작업이라 이벤트 루프를 막지 않게 스레드풀에서 돈다.
    # 상한+1바이트까지만 읽는다(크기 초과 판정과 인코딩 판별은 decode_upload).
    raw = file.file.read(settings.max_upload_bytes + 1)
    text = transaction_import_service.decode_upload(raw)
    return transaction_import_service.import_csv(db, text, current_user.id)


@router.post("/bulk-delete", response_model=BulkDeleteResultOut)
def bulk_delete_transactions(
    payload: BulkDeleteIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    bearer_token: str = Depends(get_bearer_token),
):
    deleted, failed = transaction_service.bulk_delete_transactions(db, payload.ids, bearer_token=bearer_token)
    return {"deleted": deleted, "failed": failed}


@router.put("/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int,
    payload: TransactionUpdateIn,
    response: Response,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    bearer_token: str = Depends(get_bearer_token),
):
    tx = transaction_service.update_transaction(
        db,
        tx_id,
        bearer_token=bearer_token,
        amount=payload.amount,
        type=payload.type,
        category_id=payload.category_id,
        transaction_date=payload.transaction_date,
        description=payload.description,
        payment_method=payload.payment_method,
        account_id=payload.account_id,
        savings_product_id=payload.savings_product_id,
        owner_user_id=payload.owner_user_id,
    )
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래 내역을 찾을 수 없습니다.")
    # 금액을 올리거나 다른 카테고리로 옮기는 수정도 임계치를 넘길 수 있다 — 생성과 같은 즉시 알림.
    notification_service.alert_budget_after_transaction_save(db, tx)
    if tx.growlio_sync_failed:
        response.headers["X-Growlio-Sync-Warning"] = "1"
    return tx


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    bearer_token: str = Depends(get_bearer_token),
):
    deleted = transaction_service.delete_transaction(db, tx_id, bearer_token=bearer_token)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래 내역을 찾을 수 없습니다.")
