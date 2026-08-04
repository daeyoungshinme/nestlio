from datetime import date, datetime
from decimal import Decimal

import pytest

from app.services import challenge_service
from app.services.challenge_service import ChallengeNotFoundError

NOW = datetime(2026, 8, 3, 12, 0, 0)


def _create(db, user, target=Decimal("300000"), start=date(2026, 8, 1), end=date(2026, 8, 31)):
    return challenge_service.create_challenge(db, user.id, "외식비 줄이기", "이번 달 외식비 30만원 이하로", target, start, end)


def test_create_challenge(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create(db, user)

    assert challenge.title == "외식비 줄이기"
    assert challenge.status == "active"
    assert challenge.current_amount == Decimal("0")
    assert challenge.created_by_id == user.id


def test_update_challenge(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create(db, user)

    updated = challenge_service.update_challenge(
        db, challenge.id, "외식비 20만원", "더 타이트하게", Decimal("200000"), date(2026, 8, 1), date(2026, 8, 31)
    )

    assert updated.title == "외식비 20만원"
    assert updated.target_amount == Decimal("200000")


def test_update_challenge_missing_raises(seeded_db):
    db = seeded_db["db"]
    with pytest.raises(ChallengeNotFoundError):
        challenge_service.update_challenge(db, 999, "x", None, Decimal("1"), date(2026, 8, 1), date(2026, 8, 31))


def test_update_progress_below_target_stays_active(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create(db, user, target=Decimal("300000"))

    updated = challenge_service.update_progress(db, challenge.id, Decimal("150000"), now=NOW)

    assert updated.status == "active"
    assert updated.completed_at is None
    assert updated.progress_pct == Decimal("50")


def test_update_progress_reaching_target_succeeds(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create(db, user, target=Decimal("300000"))

    updated = challenge_service.update_progress(db, challenge.id, Decimal("300000"), now=NOW)

    assert updated.status == "succeeded"
    assert updated.completed_at == NOW


def test_update_progress_missing_raises(seeded_db):
    db = seeded_db["db"]
    with pytest.raises(ChallengeNotFoundError):
        challenge_service.update_progress(db, 999, Decimal("1"), now=NOW)


def test_effective_status_active_within_period(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create(db, user, start=date(2026, 8, 1), end=date(2026, 8, 31))

    assert challenge_service.effective_status(challenge, today=date(2026, 8, 15)) == "active"


def test_effective_status_expired_after_end_date(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create(db, user, start=date(2026, 8, 1), end=date(2026, 8, 31))

    assert challenge_service.effective_status(challenge, today=date(2026, 9, 1)) == "expired"


def test_effective_status_succeeded_ignores_end_date(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create(db, user, target=Decimal("100000"), start=date(2026, 8, 1), end=date(2026, 8, 31))
    challenge_service.update_progress(db, challenge.id, Decimal("100000"), now=NOW)

    assert challenge_service.effective_status(challenge, today=date(2026, 9, 1)) == "succeeded"


def test_delete_challenge(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    challenge = _create(db, user)

    challenge_service.delete_challenge(db, challenge.id)

    assert challenge_service.list_challenges(db) == []
    with pytest.raises(ChallengeNotFoundError):
        challenge_service.get_challenge(db, challenge.id)


def test_list_challenges_orders_active_before_succeeded(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    active = _create(db, user, target=Decimal("300000"), end=date(2026, 8, 31))
    succeeded = _create(db, user, target=Decimal("100000"), end=date(2026, 8, 20))
    challenge_service.update_progress(db, succeeded.id, Decimal("100000"), now=NOW)

    rows = challenge_service.list_challenges(db)

    assert [c.id for c in rows] == [active.id, succeeded.id]
