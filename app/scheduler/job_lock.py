"""예약 잡 중복 실행 방지 — 같은 잡이 동시에 두 번 돌지 않게 Postgres advisory lock을 잡는다.

GitHub Actions curl이 `--retry 2 --retry-all-errors --max-time 170`이라, 느린 잡은 첫 실행이 아직
도는 중에 같은 잡이 다시 호출된다. 잡 본문의 dedup(`notification_log_service.already_sent` 등)은
"확인 → 발송 → 기록" 사이 창이 있어 두 실행이 겹치면 둘 다 확인을 통과해 메일이 두 번 나가거나
반복지출 거래가 두 번 생긴다. 잡 단위로 직렬화하면 그 창이 사라진다.

NotificationLog에 유니크 인덱스를 거는 대신 이 방식을 쓰는 이유: 설정 화면의 "테스트 발송"
(`force=True`)은 같은 기간 키로 의도적으로 다시 기록하고, `goal_cheer`는 dedup 키가 없고,
요약 알림은 `related_id`가 NULL이라 Postgres 기본 유니크 인덱스로는 막히지도 않는다.
"""

import logging
import zlib
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import func, select
from sqlalchemy.engine import Engine

from app.database import engine as default_engine

logger = logging.getLogger("scheduler")

# growlio와 같은 Postgres를 공유하므로 2-키 형태(namespace, job)로 다른 앱의 advisory lock과 겹치지 않게 한다.
_NAMESPACE = "nestlio:scheduled-jobs"


def _int4(text: str) -> int:
    """문자열을 프로세스·재시작과 무관하게 같은 signed int4로 (hash()는 실행마다 달라 쓸 수 없다)."""
    value = zlib.crc32(text.encode())
    return value - (1 << 32) if value >= (1 << 31) else value


def lock_keys(job_name: str) -> tuple[int, int]:
    return _int4(_NAMESPACE), _int4(job_name)


@contextmanager
def job_lock(job_name: str, engine: Engine | None = None) -> Iterator[bool]:
    """잡 실행 동안 잠금을 잡고, 이미 다른 실행이 잡고 있으면 기다리지 않고 False를 낸다.

    세션 레벨 잠금이라 잡 본문의 커밋과 무관하게 유지되도록 잡 세션과 별도의 전용 커넥션에 건다
    (ORM 세션은 커밋마다 커넥션을 풀에 돌려줘 같은 커넥션에서 해제한다는 보장이 없다).
    Postgres가 아니면(테스트 SQLite) 잠금 없이 항상 True."""
    engine = engine or default_engine
    if engine.dialect.name != "postgresql":
        yield True
        return
    namespace, key = lock_keys(job_name)
    with engine.connect() as conn:
        acquired = bool(conn.execute(select(func.pg_try_advisory_lock(namespace, key))).scalar())
        conn.commit()
        try:
            yield acquired
        finally:
            if acquired:
                try:
                    conn.execute(select(func.pg_advisory_unlock(namespace, key)))
                    conn.commit()
                except Exception:
                    # 해제에 실패한 커넥션을 풀에 돌려주면 잠금이 남은 채 재사용된다 — 버려서 세션째 닫는다.
                    logger.exception("잡 잠금 해제 실패, 커넥션 폐기: %s", job_name)
                    conn.invalidate()
