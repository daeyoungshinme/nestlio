from pydantic import BaseModel


class GrowlioImportIn(BaseModel):
    """growlio 계좌 가져오기 요청 — 대상 growlio_account_id 목록.

    account/savings_product/real_estate 3개 리소스의 가져오기 스키마가 동일한 형태라
    여기 하나로 정의하고 각 스키마 모듈이 리소스별 이름으로 alias해서 쓴다.
    """

    growlio_account_ids: list[str]


class GrowlioSyncFailureOut(BaseModel):
    """전체 동기화 중 개별 항목이 실패한 사유 (배우자 소유 등으로 growlio에서 못 찾은 경우 등)."""

    id: int
    name: str
    reason: str


class GrowlioSyncAllOut(BaseModel):
    """전체 동기화 요청 응답 — account/savings_product/real_estate 3개 리소스가 공유한다.

    GrowlioImportIn과 동일하게 여기 하나로 정의하고 각 스키마 모듈이 리소스별 이름으로 alias해서 쓴다.
    """

    synced_count: int
    failed: list[GrowlioSyncFailureOut]
