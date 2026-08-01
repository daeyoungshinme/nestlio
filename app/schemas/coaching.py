from typing import Literal

from pydantic import BaseModel, ConfigDict


class InsightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    rule_code: str
    severity: Literal["info", "warning", "critical"]
    message: str
