"""계획·실적의 섹션 — 카테고리 type(fixed/variable/irregular)이 지출 섹션이고, 수입은 따로 하나.
스키마의 Literal(schemas/cashflow_plan.CashflowSection 등)과 같은 값이어야 한다(tests/test_sections.py)."""

EXPENSE_SECTIONS: tuple[str, ...] = ("fixed", "variable", "irregular")
SECTIONS: tuple[str, ...] = ("income", *EXPENSE_SECTIONS)
