"""빈 문자열 금액 입력(<input type=number>를 비우면 "")이 KrwAmount 필드에서 0으로
처리되는지 검증한다 — Decimal이었다면 422가 났을 케이스들."""
from decimal import Decimal

import pytest

from app.schemas.account import AccountCreateIn, AccountUpdateIn
from app.schemas.cashflow_plan import CashflowPlanItemSplitIn, CashflowPlanItemUpsertIn
from app.schemas.financial_goal import FinancialGoalCreateIn, FinancialGoalUpdateIn
from app.schemas.loan import LoanCreateIn, LoanUpdateIn
from app.schemas.recurring import RecurringCreateIn
from app.schemas.savings_product import SavingsProductCreateIn, SavingsProductUpdateIn


@pytest.mark.parametrize(
    ("model", "payload", "field"),
    [
        (AccountCreateIn, {"name": "통장", "account_type": "bank", "initial_balance": ""}, "initial_balance"),
        (AccountUpdateIn, {"name": "통장", "account_type": "bank", "current_balance": ""}, "current_balance"),
        (
            SavingsProductCreateIn,
            {"name": "적금", "current_balance": "", "monthly_saving_amount": "", "principal_amount": ""},
            "current_balance",
        ),
        (
            SavingsProductUpdateIn,
            {"name": "적금", "current_balance": "", "monthly_saving_amount": "", "product_type": "savings"},
            "monthly_saving_amount",
        ),
        (LoanCreateIn, {"name": "대출", "balance": "", "monthly_payment": ""}, "balance"),
        (
            LoanUpdateIn,
            {
                "name": "대출",
                "balance": "",
                "monthly_payment": "",
                "origination_year_month": None,
                "term_months": None,
                "interest_rate": None,
                "repayment_method": None,
            },
            "monthly_payment",
        ),
        (
            FinancialGoalCreateIn,
            {"name": "목표", "required_amount": "", "monthly_saving_amount": "", "current_amount": ""},
            "required_amount",
        ),
        (
            FinancialGoalUpdateIn,
            {"priority": 1, "name": "목표", "target_age": None, "required_amount": "", "monthly_saving_amount": ""},
            "monthly_saving_amount",
        ),
        (
            CashflowPlanItemUpsertIn,
            {"section": "fixed", "year_month": "2026-08", "name": "월세", "amount": ""},
            "amount",
        ),
        (
            CashflowPlanItemSplitIn,
            {"section": "fixed", "name": "가전", "total_amount": "", "start_year_month": "2026-08"},
            "total_amount",
        ),
        (
            RecurringCreateIn,
            {"name": "구독", "category_id": 1, "amount": "", "frequency": "monthly", "start_date": "2026-08-01"},
            "amount",
        ),
    ],
)
def test_blank_amount_becomes_zero(model, payload, field):
    parsed = model.model_validate(payload)
    assert getattr(parsed, field) == Decimal("0")
