"""app/utils/dates.py의 KST 벽시계 헬퍼 검증.

now_kst()/today_kst()는 벽시계를 읽는 함수라 "시간 결정론" 컨벤션대로 고정 시각을
주입해 검증할 수는 없다 — 대신 (기계 TZ와 무관하게 성립하는) UTC 대비 +9시간 오프셋과
두 헬퍼의 상호 일관성을 확인한다. 이게 서버 TZ가 UTC여도 "naive == KST" 컨벤션이
유지되는지를 지키는 가드다.
"""
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.utils.dates import now_kst, to_kst_naive, today_kst


def test_now_kst_is_naive_and_utc_plus_nine():
    utc_now = datetime.now(UTC).replace(tzinfo=None)
    kst_now = now_kst()
    assert kst_now.tzinfo is None
    offset_seconds = (kst_now - utc_now).total_seconds()
    assert 9 * 3600 - 5 <= offset_seconds <= 9 * 3600 + 5


def test_today_kst_matches_now_kst_date():
    assert today_kst() == now_kst().date()


def test_to_kst_naive_converts_offset_datetime_to_kst_wallclock():
    # 구글 일정이 주는 형태: UTC+0 오프셋 표기 → KST(+9) 벽시계 naive
    utc_dt = datetime(2026, 8, 11, 0, 0, tzinfo=UTC)
    assert to_kst_naive(utc_dt) == datetime(2026, 8, 11, 9, 0)
    assert to_kst_naive(utc_dt).tzinfo is None

    # 이미 KST 오프셋이면 그대로 벽시계만 남는다
    kst_dt = datetime(2026, 8, 11, 15, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    assert to_kst_naive(kst_dt) == datetime(2026, 8, 11, 15, 30)
