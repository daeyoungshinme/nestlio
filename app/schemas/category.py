from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.constants.benchmark_groups import BENCHMARK_GROUPS

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
    name: str
    kind: Literal["income", "expense"] = "expense"
    type: Literal["fixed", "variable", "irregular"]
    color: str
    benchmark_group: BenchmarkGroup | None = None


class CategoryUpdateIn(BaseModel):
    name: str
    kind: Literal["income", "expense"]
    type: Literal["fixed", "variable", "irregular"]
    color: str
    benchmark_group: BenchmarkGroup | None = None
