import uuid
from decimal import Decimal

import pytest

from app.services import email_templates


@pytest.mark.parametrize("streak", [0, -1])
def test_streak_banner_empty_when_not_positive(streak):
    assert email_templates._streak_banner(streak) == ""


def test_streak_banner_shows_count_when_positive():
    html = email_templates._streak_banner(3)

    assert "연속 3개월째" in html


@pytest.mark.parametrize(
    "owner_totals",
    [
        None,
        [],
        [{"owner_user_id": None, "display_name": "공통", "savings": Decimal("100000")}],
        [{"owner_user_id": uuid.uuid4(), "display_name": "혼자", "savings": Decimal("100000")}],
    ],
)
def test_contribution_section_empty_when_fewer_than_two_contributors(owner_totals):
    assert email_templates._contribution_section(owner_totals) == ""


def test_contribution_section_crowns_the_leader_when_savings_differ():
    id1, id2 = uuid.uuid4(), uuid.uuid4()
    owner_totals = [
        {"owner_user_id": id1, "display_name": "민준", "savings": Decimal("300000")},
        {"owner_user_id": id2, "display_name": "서연", "savings": Decimal("500000")},
    ]

    html = email_templates._contribution_section(owner_totals)

    assert "부부 저축 기여도" in html
    assert html.count("\U0001F451") == 1  # 리더 한 명에게만 크라운
    assert html.index("서연") < html.index("민준")  # savings 내림차순


def test_contribution_section_omits_crown_on_tie():
    id1, id2 = uuid.uuid4(), uuid.uuid4()
    owner_totals = [
        {"owner_user_id": id1, "display_name": "민준", "savings": Decimal("400000")},
        {"owner_user_id": id2, "display_name": "서연", "savings": Decimal("400000")},
    ]

    html = email_templates._contribution_section(owner_totals)

    assert "\U0001F451" not in html


def _summary_inputs():
    from datetime import date

    totals = {
        "income": Decimal("3000000"),
        "expense": Decimal("1234567"),
        "savings": Decimal("1765433"),
        "fixed": Decimal("800000"),
        "variable": Decimal("400000"),
        "irregular": Decimal("34567"),
    }
    breakdown = [{"name": "식비", "color": "#14b8a6", "amount": Decimal("400000")}]
    return date(2026, 7, 1), date(2026, 7, 31), totals, breakdown


def test_weekly_summary_html_renders_totals_categories_and_streak():
    start, end, totals, breakdown = _summary_inputs()
    html = email_templates.build_weekly_summary_html(start, end, totals, breakdown, streak=3)
    assert html.startswith("<!doctype html>")
    assert "1,234,567원" in html
    assert "식비" in html
    assert "2026-07-01 ~ 2026-07-31" in html
    assert "3개월" in html


def test_monthly_summary_html_includes_insights_only_when_present():
    from app.services.coaching_engine import Insight

    start, end, totals, breakdown = _summary_inputs()
    without = email_templates.build_monthly_summary_html(start, end, totals, breakdown, [])
    with_insight = email_templates.build_monthly_summary_html(
        start, end, totals, breakdown, [Insight("savings_rate", "warning", "저축률이 낮아요")]
    )
    assert "자산증식 코칭" not in without
    assert "자산증식 코칭" in with_insight and "저축률이 낮아요" in with_insight


def test_summary_html_handles_empty_breakdown():
    start, end, totals, _ = _summary_inputs()
    html = email_templates.build_weekly_summary_html(start, end, totals, [])
    assert "이 기간 지출 내역이 없어요." in html
