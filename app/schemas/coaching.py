from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class InsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rule_code: str
    severity: Literal["info", "warning", "critical"]
    message: str


class SurplusAllocationOut(BaseModel):
    """이번달 투자 가능 여유자금(investable_surplus)을 비상금 보충분/투자 가능분으로 나눈 제안.
    coaching_engine.recommend_surplus_allocation 참고."""

    emergency_fund_portion: Decimal
    investable_portion: Decimal
