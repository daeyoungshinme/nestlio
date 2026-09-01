"""growlio(자산관리, 별도 서비스)의 자산 조회/입출금 반영 API를 호출하는 클라이언트.

nestlio와 growlio는 같은 Supabase 프로젝트를 공유하므로, 사용자의 Supabase JWT를
그대로 growlio에 전달한다(growlio의 get_current_user가 동일한 JWKS로 검증한다) —
별도 서비스 API 키/시크릿은 쓰지 않는다. 저축상품 ↔ growlio 계좌 자동 동기화
(app/services/savings_product_service.py), 부동산 자산+담보대출 자동 동기화
(app/services/real_estate_service.py), 저축/투자 내역의 growlio 입출금 반영
(app/services/transaction_service.py), 재무목표 신규 작성 시 growlio 투자목표
프리필(app/services/goal_service.py)에서 사용한다.
"""

from datetime import date
from decimal import Decimal

import httpx
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings

_TIMEOUT = 5.0

# growlio의 AssetType(app/enums.py) 중 은행 입출금 계좌 — nestlio의 계좌(Account) 가져오기 대상.
# nestlio는 growlio의 enum을 직접 import하지 않으므로(별도 서비스, 느슨한 결합) 문자열로 매핑한다.
BANK_ASSET_TYPES = {"BANK_ACCOUNT"}

# growlio의 AssetType 중 증권/투자성 계좌 — nestlio의 저축상품(investment) 가져오기 대상.
# REAL_ESTATE는 여기 포함하지 않는다 — 시세/담보대출을 분리해서 다뤄야 해서 전용 플로우
# (fetch_real_estate_items, app/services/real_estate_service.py)로 별도 처리한다.
INVESTMENT_ASSET_TYPES = {"STOCK_KIS", "STOCK_KIWOOM", "STOCK_OTHER", "CASH_STOCK"}

REAL_ESTATE_ASSET_TYPE = "REAL_ESTATE"

# 전체 동기화(sync_all_*)에서 배우자 소유·삭제 등으로 growlio 목록에 매칭되는 항목이 없을 때
# failed[].reason에 담는 문구 — account_service/savings_product_service가 공유한다.
# (real_estate_service는 "부동산 계좌"로 명사만 다른 자체 문구를 쓴다.)
SYNC_MATCH_FAILED_REASON = "growlio에서 연동된 계좌를 찾을 수 없습니다 (배우자 계정이거나 삭제되었을 수 있습니다)."


class GrowlioNotConfiguredError(Exception):
    """settings.growlio_api_base_url이 비어 있어 연동 기능 자체가 꺼져 있을 때."""


class GrowlioRequestError(Exception):
    """growlio API 호출이 실패했을 때 (네트워크 오류, 인증 실패, 5xx 등)."""


class GrowlioSyncError(Exception):
    """동기화 요청이 사용자에게 보여줄 수 있는 사유로 실패했을 때 (연동 없음/계좌 못 찾음).

    account_service/savings_product_service/real_estate_service가 공통으로 쓰는 예외라
    growlio_client에 단일 정의하고 각 서비스가 여기서 import한다.
    """


def _request(method: str, path: str, bearer_token: str, *, json: dict | None = None) -> dict | list:
    if not settings.growlio_api_base_url:
        raise GrowlioNotConfiguredError("growlio 연동이 설정되지 않았습니다 (GROWLIO_API_BASE_URL).")
    url = f"{settings.growlio_api_base_url.rstrip('/')}/api/v1/external/{path}"
    try:
        response = httpx.request(
            method, url, json=json, headers={"Authorization": f"Bearer {bearer_token}"}, timeout=_TIMEOUT
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise GrowlioRequestError(f"growlio API 오류 (status={exc.response.status_code})") from exc
    except httpx.HTTPError as exc:
        raise GrowlioRequestError("growlio 서버에 연결하지 못했습니다.") from exc
    return response.json()


def fetch_account_balances(bearer_token: str) -> list[dict]:
    """현재 사용자의 growlio 계좌 목록과 최신 평가액(KRW)을 조회한다."""
    return _request("GET", "accounts", bearer_token)


def fetch_real_estate_items(bearer_token: str) -> list[dict]:
    """현재 사용자의 growlio 부동산 계좌를 시세/담보대출 잔액 분리 형태로 조회한다.

    fetch_account_balances(GET /external/accounts)는 부동산도 담보대출을 뺀 순액 하나만
    주지만, nestlio가 "자산 항목"(저축/투자 상품)과 "대출 항목"을 각각 등록하려면 원본
    시세와 대출잔액이 따로 필요하다 (GET /external/real-estate).
    """
    return _request("GET", "real-estate", bearer_token)


def fetch_investment_goal(bearer_token: str) -> dict:
    """현재 사용자가 growlio에 설정한 투자목표(목표금액/목표수익률/연 납입목표 등)를 조회한다.

    nestlio 재무목표(FinancialGoal) 신규 작성 폼을 미리 채우는 용도로만 쓰인다 — 진행률은
    이 값이 아니라 이미 가져온 growlio 연동 저축/투자 상품 잔액으로 nestlio가 직접 계산한다.
    """
    return _request("GET", "goal", bearer_token)


def push_transaction(
    bearer_token: str,
    growlio_account_id: str,
    transaction_type: str,
    amount: Decimal,
    transaction_date: date,
    notes: str | None = None,
) -> dict:
    """저축/투자 내역을 growlio 계좌의 입출금 내역(및 수동 계좌라면 예수금)에 반영한다.

    transaction_type은 "DEPOSIT" | "WITHDRAWAL"만 허용된다(growlio 쪽 검증과 동일).
    KIS/키움처럼 자동 연동된 계좌는 growlio가 예수금은 건드리지 않고 내역만 기록한다.

    growlio의 `/external/transactions`는 amount를 float로 선언하고 내부 도메인 자체가 float 기반이라
    (growlio backend app/api/v1/external.py 확인), 여기서 float(amount)로 변환해 보내는 것이 정밀도
    손실이 아니라 growlio 계약과 정확히 일치하는 경계 변환이다 — str(amount)로 바꿔도 growlio가 결국
    float으로 파싱해 산술하므로 이득이 없다.
    """
    payload = {
        "account_id": growlio_account_id,
        "transaction_type": transaction_type,
        "amount": float(amount),
        "transaction_date": transaction_date.isoformat(),
        "notes": notes,
    }
    return _request("POST", "transactions", bearer_token, json=payload)


def to_decimal_krw(raw) -> Decimal:
    """growlio 응답의 *_krw 숫자 필드(float/int/str)를 Decimal로 변환한다."""
    return Decimal(str(raw))


def find_by_growlio_id(items: list[dict], growlio_id: str) -> dict | None:
    """growlio 목록 응답에서 id가 일치하는 항목을 찾는다 (단건 동기화 매칭용)."""
    return next((item for item in items if item["id"] == growlio_id), None)


def already_linked_growlio_ids(db: Session, model, *, active_only: bool = True) -> set[str]:
    """model.growlio_account_id가 채워진 로우들의 growlio_account_id 집합.

    가져오기(import_from_growlio) 시 이미 연동된 growlio 계좌를 중복 가져오지 않도록
    account_service/savings_product_service/real_estate_service가 공통으로 쓴다.
    """
    query = db.query(model.growlio_account_id).filter(model.growlio_account_id.isnot(None))
    if active_only:
        query = query.filter(model.is_active.is_(True))
    return {growlio_id for (growlio_id,) in query}


def register_exception_handlers(app: FastAPI) -> None:
    """accounts/savings_products/real_estate/goals 라우터가 각자 반복하던
    growlio 예외 -> HTTP status 매핑을 앱 전역에서 한 번만 처리한다.

    FastAPI의 기본 HTTPException 핸들러와 동일한 응답 형식({"detail": ...})을
    직접 반환한다 - exception_handler 안에서 HTTPException을 raise하면 그
    핸들러 밖으로 예외가 그대로 전파되어 500으로 떨어지므로 쓰지 않는다.
    """

    @app.exception_handler(GrowlioNotConfiguredError)
    def _not_configured(request: Request, exc: GrowlioNotConfiguredError):
        return JSONResponse(status_code=status.HTTP_501_NOT_IMPLEMENTED, content={"detail": str(exc)})

    @app.exception_handler(GrowlioRequestError)
    def _request_error(request: Request, exc: GrowlioRequestError):
        return JSONResponse(status_code=status.HTTP_502_BAD_GATEWAY, content={"detail": str(exc)})

    @app.exception_handler(GrowlioSyncError)
    def _sync_error(request: Request, exc: GrowlioSyncError):
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)})
