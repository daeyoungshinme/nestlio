from decimal import Decimal

from app.constants.insurance import TARGETED_COVERAGES
from app.schemas.settings import InsuranceTargetsIn, InsuranceTargetsOut
from app.services import insurance_target_service, user_setting_service


def test_defaults_until_saved_then_saved_value_wins(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    assert insurance_target_service.get_targets(db)["cancer"] == Decimal("30000000")

    result = insurance_target_service.set_targets(db, {"cancer": Decimal("50000000"), "death": Decimal("0")}, user.id)

    assert result["cancer"] == Decimal("50000000")
    assert result["death"] == Decimal("0")  # 0 = 기준 없음(기본값으로 돌아가지 않는다)
    assert result["stroke"] == Decimal("20000000")  # 보내지 않은 보장은 기본값 그대로


def test_corrupt_value_falls_back_to_default(seeded_db):
    db, user = seeded_db["db"], seeded_db["user"]
    user_setting_service.set_shared_setting(db, "insurance_target_heart", "abc", user.id)
    assert insurance_target_service.get_targets(db)["heart"] == Decimal("20000000")


def test_schema_fields_match_targeted_coverages():
    """보장을 추가하면 상수·설정 기본값·입출력 스키마를 같이 고쳐야 한다 — 하나라도 빠지면 여기서 잡는다."""
    assert tuple(InsuranceTargetsOut.model_fields) == TARGETED_COVERAGES
    assert tuple(InsuranceTargetsIn.model_fields) == TARGETED_COVERAGES
    for coverage in TARGETED_COVERAGES:
        assert insurance_target_service.default_target(coverage) >= 0
