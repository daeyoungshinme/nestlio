from decimal import Decimal

import pytest

from app.services import milestone_service


@pytest.mark.parametrize(
    "progress_pct,expected",
    [
        (Decimal("10"), None),
        (Decimal("25"), 25),
        (Decimal("49.9"), 25),
        (Decimal("50"), 50),
        (Decimal("83"), 75),
        (Decimal("100"), 100),
        (Decimal("120"), 100),
    ],
)
def test_highest_crossed(progress_pct, expected):
    assert milestone_service.highest_crossed(progress_pct) == expected


def test_already_logged_roundtrip(db_session):
    assert milestone_service.already_logged(db_session, "goal_milestone", related_id=1, milestone=50) is False

    milestone_service.log(db_session, "goal_milestone", "goal", related_id=1, milestone=50, detail="목표 50% 달성")

    assert milestone_service.already_logged(db_session, "goal_milestone", related_id=1, milestone=50) is True
    # 다른 마일스톤/다른 대상은 별개로 취급된다
    assert milestone_service.already_logged(db_session, "goal_milestone", related_id=1, milestone=75) is False
    assert milestone_service.already_logged(db_session, "goal_milestone", related_id=2, milestone=50) is False
