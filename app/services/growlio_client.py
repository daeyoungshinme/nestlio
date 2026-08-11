"""growlio(자산관리, 별도 서비스)의 자산 조회/입출금 반영 API를 호출하는 클라이언트.

nestlio와 growlio는 같은 Supabase 프로젝트를 공유하므로, 사용자의 Supabase JWT를
그대로 growlio에 전달한다(growlio의 get_current_user가 동일한 JWKS로 검증한다) —
별도 서비스 API 키/시크릿은 쓰지 않는다. 저축상품 ↔ growlio 계좌 자동 동기화
(app/services/savings_product_service.py), 저축/투자 내역의 growlio 입출금 반영
(app/services/transaction_service.py)에서 사용한다.
"""

from datetime import date

import httpx

from app.config import settings

_TIMEOUT = 5.0

# growlio의 AssetType(app/enums.py) 중 은행 입출금 계좌 — nestlio의 계좌(Account) 가져오기 대상.
# nestlio는 growlio의 enum을 직접 import하지 않으므로(별도 서비스, 느슨한 결합) 문자열로 매핑한다.
BANK_ASSET_TYPES = {"BANK_ACCOUNT"}

# growlio의 AssetType 중 증권/투자성 계좌 — nestlio의 저축상품(investment) 가져오기 대상.
INVESTMENT_ASSET_TYPES = {"STOCK_KIS", "STOCK_KIWOOM", "STOCK_OTHER", "CASH_STOCK", "REAL_ESTATE"}


class GrowlioNotConfiguredError(Exception):
    """settings.growlio_api_base_url이 비어 있어 연동 기능 자체가 꺼져 있을 때."""


class GrowlioRequestError(Exception):
    """growlio API 호출이 실패했을 때 (네트워크 오류, 인증 실패, 5xx 등)."""


def fetch_account_balances(bearer_token: str) -> list[dict]:
    """현재 사용자의 growlio 계좌 목록과 최신 평가액(KRW)을 조회한다."""
    if not settings.growlio_api_base_url:
        raise GrowlioNotConfiguredError("growlio 연동이 설정되지 않았습니다 (GROWLIO_API_BASE_URL).")
    url = f"{settings.growlio_api_base_url.rstrip('/')}/api/v1/external/accounts"
    try:
        response = httpx.get(url, headers={"Authorization": f"Bearer {bearer_token}"}, timeout=_TIMEOUT)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise GrowlioRequestError(f"growlio API 오류 (status={exc.response.status_code})") from exc
    except httpx.HTTPError as exc:
        raise GrowlioRequestError("growlio 서버에 연결하지 못했습니다.") from exc
    return response.json()


def push_transaction(
    bearer_token: str,
    growlio_account_id: str,
    transaction_type: str,
    amount,
    transaction_date: date,
    notes: str | None = None,
) -> dict:
    """저축/투자 내역을 growlio 계좌의 입출금 내역(및 수동 계좌라면 예수금)에 반영한다.

    transaction_type은 "DEPOSIT" | "WITHDRAWAL"만 허용된다(growlio 쪽 검증과 동일).
    KIS/키움처럼 자동 연동된 계좌는 growlio가 예수금은 건드리지 않고 내역만 기록한다.
    """
    if not settings.growlio_api_base_url:
        raise GrowlioNotConfiguredError("growlio 연동이 설정되지 않았습니다 (GROWLIO_API_BASE_URL).")
    url = f"{settings.growlio_api_base_url.rstrip('/')}/api/v1/external/transactions"
    payload = {
        "account_id": growlio_account_id,
        "transaction_type": transaction_type,
        "amount": float(amount),
        "transaction_date": transaction_date.isoformat(),
        "notes": notes,
    }
    try:
        response = httpx.post(
            url, json=payload, headers={"Authorization": f"Bearer {bearer_token}"}, timeout=_TIMEOUT
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise GrowlioRequestError(f"growlio API 오류 (status={exc.response.status_code})") from exc
    except httpx.HTTPError as exc:
        raise GrowlioRequestError("growlio 서버에 연결하지 못했습니다.") from exc
    return response.json()
