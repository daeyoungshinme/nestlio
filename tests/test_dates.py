"""app/utils/dates.py의 KST 벽시계 헬퍼 검증.

now_kst()/today_kst()는 벽시계를 읽는 함수라 "시간 결정론" 컨벤션대로 고정 시각을
주입해 검증할 수는 없다 — 대신 (기계 TZ와 무관하게 성립하는) UTC 대비 +9시간 오프셋과
두 헬퍼의 상호 일관성을 확인한다. 이게 서버 TZ가 UTC여도 "naive == KST" 컨벤션이
유지되는지를 지키는 가드다.
"""
from datetime import UTC, datetime

from app.utils.dates import now_kst, today_kst


def test_now_kst_is_naive_and_utc_plus_nine():
    utc_now = datetime.now(UTC).replace(tzinfo=None)
    kst_now = now_kst()
    assert kst_now.tzinfo is None
    offset_seconds = (kst_now - utc_now).total_seconds()
    assert 9 * 3600 - 5 <= offset_seconds <= 9 * 3600 + 5


def test_today_kst_matches_now_kst_date():
    assert today_kst() == now_kst().date()




def test_model_timestamp_columns_default_to_kst_in_python():
    """`server_default=func.now()`만 있으면 Postgres 세션 TZ(Supabase=UTC)로 찍혀 "naive == KST" 규칙이 깨진다 —
    타임스탬프 컬럼은 파이썬 쪽 `default=now_kst`(갱신 컬럼은 `onupdate`도)를 함께 둔다."""
    import app.models  # noqa: F401 — 모든 모델을 metadata에 등록
    from app.database import Base

    missing = []
    for table in Base.metadata.tables.values():
        for column in table.columns:
            server_default = getattr(column.server_default, "arg", None)
            if server_default is None or "now" not in str(server_default).lower():
                continue
            if column.default is None or not column.default.is_callable:
                missing.append(f"{table.name}.{column.name} default")
            if column.onupdate is not None and not column.onupdate.is_callable:
                missing.append(f"{table.name}.{column.name} onupdate")
    assert not missing
