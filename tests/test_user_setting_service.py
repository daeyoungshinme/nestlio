from app.services import user_setting_service


def test_set_then_get_shared_setting(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]

    user_setting_service.set_shared_setting(db, "emergency_fund_target", "3000000", user.id)

    assert user_setting_service.get_shared_setting(db, "emergency_fund_target") == "3000000"


def test_get_shared_setting_returns_default_when_missing(db_session):
    assert user_setting_service.get_shared_setting(db_session, "no_such_key", default="fallback") == "fallback"
    assert user_setting_service.get_shared_setting(db_session, "no_such_key") is None


def test_set_shared_setting_overwrites_existing_row_regardless_of_who_saved_it(seeded_db):
    """household 공유 설정이므로 다른 유저가 저장해도 같은 key의 기존 행을 갱신한다(새 행이 아니라)."""
    from uuid import uuid4

    db, user = seeded_db["db"], seeded_db["user"]
    user_setting_service.set_shared_setting(db, "theme", "light", user.id)

    other_user_id = uuid4()
    user_setting_service.set_shared_setting(db, "theme", "dark", other_user_id)

    assert user_setting_service.get_shared_setting(db, "theme") == "dark"


def test_get_shared_settings_omits_missing_keys(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    user_setting_service.set_shared_setting(db, "a", "1", user.id)

    result = user_setting_service.get_shared_settings(db, ["a", "b"])

    assert result == {"a": "1"}
