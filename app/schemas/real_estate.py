from datetime import date

from pydantic import BaseModel

from app.schemas.growlio import GrowlioImportIn
from app.schemas.loan import LoanOut
from app.schemas.savings_product import SavingsProductOut


class GrowlioRealEstateOut(BaseModel):
    """growlio `/api/v1/external/real-estate` 응답을 그대로 전달하는 프록시용 스키마.

    growlio 자체가 도메인 전체에서 float를 쓰므로(정밀도 손실은 이미 growlio 쪽에서 발생) 여기서
    Decimal로 감싸도 복구되지 않는다 — float 유지가 의도된 설계다. 이 값을 nestlio 자체 Decimal
    컬럼(SavingsProduct/Loan 등)에 저장할 때는 반드시 `Decimal(str(x))`로 재변환한다."""

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


RealEstateGrowlioImportIn = GrowlioImportIn


class RealEstateImportResultOut(BaseModel):
    """growlio 부동산 계좌 하나를 가져오거나 동기화한 결과 — 자산 항목(저축/투자 상품)과
    담보대출(있는 경우)이 짝을 이룬다."""

    savings_product: SavingsProductOut
    loan: LoanOut | None = None
