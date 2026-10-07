from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.constants.benchmark_groups import BENCHMARK_GROUPS
from app.schemas.common import bounded_str

BenchmarkGroup = Literal[tuple(BENCHMARK_GROUPS)]  # type: ignore[valid-type]


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
    benchmark_group: BenchmarkGroup | None = None


class CategoryCreateIn(BaseModel):
    name: bounded_str(100)
    kind: Literal["income", "expense"] = "expense"
    type: Literal["fixed", "variable", "irregular"]
    color: bounded_str(20)
    benchmark_group: BenchmarkGroup | None = None


class CategoryUpdateIn(BaseModel):
    name: bounded_str(100)
    kind: Literal["income", "expense"]
    type: Literal["fixed", "variable", "irregular"]
    color: bounded_str(20)
    benchmark_group: BenchmarkGroup | None = None
