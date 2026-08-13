from pydantic import BaseModel


class GrowlioImportIn(BaseModel):
    """growlio 계좌 가져오기 요청 — 대상 growlio_account_id 목록.

    account/savings_product/real_estate 3개 리소스의 가져오기 스키마가 동일한 형태라
    여기 하나로 정의하고 각 스키마 모듈이 리소스별 이름으로 alias해서 쓴다.
    """

    growlio_account_ids: list[str]
