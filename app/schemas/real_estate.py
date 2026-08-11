from datetime import date

from pydantic import BaseModel

from app.schemas.loan import LoanOut
from app.schemas.savings_product import SavingsProductOut


class GrowlioRealEstateOut(BaseModel):
    """growlio `/api/v1/external/real-estate` 응답을 그대로 전달하는 프록시용 스키마."""

    id: str
    name: str
    address: str | None = None
    property_type: str | None = None
    market_value_krw: float
    mortgage_balance_krw: float
    net_equity_krw: float
    purchase_price_krw: float | None = None
    purchase_date: str | None = None
    as_of: date | None = None


class RealEstateGrowlioImportIn(BaseModel):
    growlio_account_ids: list[str]


class RealEstateImportResultOut(BaseModel):
    """growlio 부동산 계좌 하나를 가져오거나 동기화한 결과 — 자산 항목(저축/투자 상품)과
    담보대출(있는 경우)이 짝을 이룬다."""

    savings_product: SavingsProductOut
    loan: LoanOut | None = None
