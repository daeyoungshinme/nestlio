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
