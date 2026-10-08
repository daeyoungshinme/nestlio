import logging
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
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
from app.utils.dates import month_bounds, today_kst, year_month_str

router = APIRouter(prefix="/transactions", tags=["transactions"])
logger = logging.getLogger("transactions")


def _alert_budget_after_save(db: Session, tx) -> None:
    """지출 거래 저장 직후 그 카테고리 예산 임계치 알림 — 실패해도 거래는 이미 저장됐으니 로그만 남긴다.
    과거 날짜 지출이면 그 달 예산을 본다(이번 달 기준이면 엉뚱한 달을 검사한다)."""
    if tx.type != "expense":
        return
    try:
        notification_service.check_and_alert_budget_threshold(
            db, tx.category_id, year_month_str(tx.transaction_date)
        )
    except Exception:
        logger.exception("예산 초과 알림 발송 실패 (거래는 정상 저장됨)")

# 검색(q)만 주고 기간을 안 주면 "전체 기간" 합계를 낸다 — 하한을 이 앱에 거래가 있을 리 없는
# 먼 과거로 잡아 사실상 무한 하한처럼 쓴다.
_ALL_TIME_START = date(2000, 1, 1)
# 검색 모드(기간 미지정)의 목록엔 미래 날짜 거래도 포함되므로 합계도 상한을 두지 않는다.
_ALL_TIME_END = date(9999, 12, 31)


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
    default_from, default_to = month_bounds(today_kst())
    df = date_from or (None if q else default_from)
    dt = date_to or (None if q else default_to)
    items = transaction_service.list_transactions(db, df, dt, category_id, type, user_id, q=q)
    totals = transaction_report_service.period_totals(
        db, df or _ALL_TIME_START, dt or _ALL_TIME_END, category_id=category_id, type_=type, user_id=user_id, q=q
    )
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
    _alert_budget_after_save(db, tx)
    _notify_partner_saving(db, current_user, tx)
    if tx.growlio_sync_failed:
        response.headers["X-Growlio-Sync-Warning"] = "1"
    return tx


def _notify_partner_saving(db: Session, user: User, tx) -> None:
    """저축 거래면 배우자 알림함에 남긴다 — 알림 실패가 거래 저장 응답을 막지 않게 로그만 남긴다."""
    try:
        notification_inbox_service.log_partner_saving(db, user.id, user.display_name, tx)
    except Exception:
        db.rollback()
        logger.exception("배우자 저축 알림 기록 실패 (거래는 정상 저장됨)")


@router.get("/category-breakdown", response_model=list[CategoryAmountOut])
def category_breakdown(
    date_from: date | None = None,
    date_to: date | None = None,
    type: Literal["income", "expense"] = "expense",
    user_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    default_from, default_to = month_bounds(today_kst())
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
    return transaction_service.frequent_unique_transactions(db, type, today_kst(), is_savings, limit)


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
    default_from, default_to = month_bounds(today_kst())
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
def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # async def가 아니라 def — 가져오기 전체가 동기 DB 작업이라 이벤트 루프를 막지 않게 스레드풀에서 돈다.
    # 상한+1바이트까지만 읽는다 — 통째로 read()하면 거대한 업로드 하나가 Render 무료 인스턴스 메모리를 다 쓴다.
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    raw = file.file.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE, f"CSV 파일은 {settings.max_upload_size_mb}MB를 넘을 수 없습니다."
        )
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("cp949")
        except UnicodeDecodeError:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "CSV 파일 인코딩을 읽을 수 없습니다. UTF-8 또는 CP949로 저장해 주세요."
            ) from None
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
    # 금액을 올리거나 다른 카테고리로 옮기는 수정도 임계치를 넘길 수 있다 — 생성과 같은 즉시 알림.
    _alert_budget_after_save(db, tx)
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
