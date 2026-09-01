import logging
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_bearer_token, get_current_user
from app.models.user import User
from app.schemas.common import CategoryAmountOut
from app.schemas.transaction import (
    BulkDeleteIn,
    BulkDeleteResultOut,
    ImportResultOut,
    SheetImportIn,
    TransactionCreateIn,
    TransactionListOut,
    TransactionOut,
    TransactionUpdateIn,
)
from app.services import notification_service, transaction_import_service, transaction_report_service, transaction_service
from app.services.google_auth import GoogleNotConnectedError
from app.services.google_sheets_service import GoogleSheetsReadError
from app.utils.dates import month_bounds

router = APIRouter(prefix="/transactions", tags=["transactions"])
logger = logging.getLogger("transactions")

# 검색(q)만 주고 기간을 안 주면 "전체 기간" 합계를 낸다 — 하한을 이 앱에 거래가 있을 리 없는
# 먼 과거로 잡아 사실상 무한 하한처럼 쓴다.
_ALL_TIME_START = date(2000, 1, 1)


@router.get("", response_model=TransactionListOut)
def list_transactions(
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    type: Literal["income", "expense"] | None = None,
    user_id: uuid.UUID | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    default_from, default_to = month_bounds(date.today())
    df = date_from or (None if q else default_from)
    dt = date_to or (None if q else default_to)
    items = transaction_service.list_transactions(db, df, dt, category_id, type, user_id, q=q)
    totals = transaction_report_service.period_totals(db, df or _ALL_TIME_START, dt or date.today())
    return {"items": items, "totals": totals}


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreateIn,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    bearer_token: str = Depends(get_bearer_token),
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
            owner_user_id=payload.owner_user_id,
            bearer_token=bearer_token,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if payload.type == "expense":
        try:
            notification_service.check_and_alert_budget_threshold(db, payload.category_id)
        except Exception:
            logger.exception("예산 초과 알림 발송 실패 (거래는 정상 저장됨)")
    if getattr(tx, "growlio_sync_failed", False):
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
    default_from, default_to = month_bounds(date.today())
    df = date_from or default_from
    dt = date_to or default_to
    return transaction_report_service.category_breakdown(db, df, dt, type, user_id)


@router.get("/recent-items", response_model=list[TransactionOut])
def recent_items(
    type: Literal["income", "expense"],
    is_savings: bool = False,
    limit: int = 8,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return transaction_service.frequent_unique_transactions(db, type, date.today(), is_savings, limit)


@router.get("/export.csv")
def export_csv(
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    type: Literal["income", "expense"] | None = None,
    user_id: uuid.UUID | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    default_from, default_to = month_bounds(date.today())
    df = date_from or default_from
    dt = date_to or default_to
    items = transaction_service.list_transactions(db, df, dt, category_id, type, user_id, q=q)
    csv_text = transaction_import_service.export_csv(items)
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
    return transaction_import_service.import_csv(db, text, current_user.id)


@router.post("/import-sheet", response_model=ImportResultOut)
def import_sheet(
    payload: SheetImportIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        if payload.mode == "public":
            if not payload.sheet_url:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "시트 링크를 입력해주세요.")
            return transaction_import_service.import_from_sheet_url(db, payload.sheet_url, current_user.id)
        if not payload.spreadsheet_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "스프레드시트 ID를 입력해주세요.")
        return transaction_import_service.import_from_spreadsheet(
            db, payload.spreadsheet_id, payload.sheet_name, current_user.id
        )
    except (GoogleSheetsReadError, GoogleNotConnectedError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.post("/bulk-delete", response_model=BulkDeleteResultOut)
def bulk_delete_transactions(
    payload: BulkDeleteIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    bearer_token: str = Depends(get_bearer_token),
):
    deleted, failed = transaction_service.bulk_delete_transactions(db, payload.ids, bearer_token=bearer_token)
    return {"deleted": deleted, "failed": failed}


@router.get("/{tx_id}", response_model=TransactionOut)
def get_transaction(tx_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    tx = transaction_service.get_transaction(db, tx_id)
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래 내역을 찾을 수 없습니다.")
    return tx


@router.put("/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int,
    payload: TransactionUpdateIn,
    response: Response,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
    bearer_token: str = Depends(get_bearer_token),
):
    try:
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
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if tx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="거래 내역을 찾을 수 없습니다.")
    if getattr(tx, "growlio_sync_failed", False):
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
