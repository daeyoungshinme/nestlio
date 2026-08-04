from typing import Literal

from pydantic import BaseModel, ConfigDict


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    kind: Literal["income", "expense"]
    type: Literal["fixed", "variable", "irregular"]
    color: str
    icon: str | None = None
    is_active: bool
    is_discretionary: bool = False
    is_debt: bool = False
    is_savings: bool = False
    sort_order: int


class CategoryCreateIn(BaseModel):
    name: str
    kind: Literal["income", "expense"] = "expense"
    type: Literal["fixed", "variable", "irregular"]
    color: str


class CategoryUpdateIn(BaseModel):
    name: str
    kind: Literal["income", "expense"]
    type: Literal["fixed", "variable", "irregular"]
    color: str
