"""부부 각자의 growlio 투자목표 마지막 값(GrowlioGoalSnapshot) 저장·조회.

nestlio는 호출자 JWT로만 growlio를 읽을 수 있어(growlio_client) 배우자의 growlio 목표를 직접 조회하지 못한다. 각자
nestlio를 열 때 본인 값을 저장해 두고(`refresh_if_stale` — 화면 로드 후 BackgroundTasks, 또는 `refresh_own` — "지금
동기화"), 부부 통합 목표는 두 사람의 저장값을 합산한다(조회는 combined_goal_service.active_snapshots). 스케줄러엔 JWT가 없어 예약 갱신은 하지 않는다."""

import logging
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.financial_goal import FinancialGoal
from app.models.growlio_goal_snapshot import GrowlioGoalSnapshot
from app.services import combined_goal_service, growlio_client
from app.utils.dates import now_kst

logger = logging.getLogger(__name__)

# 잔액 연동의 기회주의적 갱신(net_worth_service.STALE_GROWLIO_LINK_AFTER)과 같은 주기. net_worth_service가 이 모듈을
# 부르므로(schedule_background_refresh) 그쪽 상수를 import하면 순환이 된다.
STALE_AFTER = timedelta(hours=12)

_AMOUNT_LIMIT = Decimal("999999999999.99")  # Numeric(14, 2)
_PCT_LIMIT = Decimal("999999.99")  # Numeric(8, 2)
_CENT = Decimal("0.01")

_AMOUNT_FIELDS = {
    "goal_amount": "goal_amount",
    "investable_assets": "investable_assets_krw",
    "monthly_deposit_amount": "monthly_deposit_amount",
    "annual_deposit_goal": "annual_deposit_goal",
    "annual_deposit_current": "annual_deposit_current",
    "annual_dividend_goal": "annual_dividend_goal",
    "estimated_annual_dividend": "estimated_annual_dividend",
}
_PCT_FIELDS = {
    "goal_annual_return_pct": "goal_annual_return_pct",
    "actual_return_pct": "actual_return_pct",
}


def _bounded(raw, limit: Decimal) -> Decimal | None:
    """growlio의 float 값을 저장 컬럼 범위로 맞춘다 — 범위를 넘는 값은 Postgres에서 DataError(500)가 된다.
    NaN·Infinity는 None."""
    if raw is None:
        return None
    value = growlio_client.to_decimal_krw(raw)
    if not value.is_finite():
        return None
    return max(-limit, min(limit, value.quantize(_CENT)))


def _apply(snapshot: GrowlioGoalSnapshot, payload: dict, now: datetime) -> None:
    configured = bool(payload.get("is_configured"))
    snapshot.is_configured = configured
    for column, key in _AMOUNT_FIELDS.items():
        setattr(snapshot, column, _bounded(payload.get(key), _AMOUNT_LIMIT) if configured else None)
    for column, key in _PCT_FIELDS.items():
        setattr(snapshot, column, _bounded(payload.get(key), _PCT_LIMIT) if configured else None)
    year = payload.get("retirement_target_year")
    snapshot.retirement_target_year = int(year) if configured and isinstance(year, int | float) else None
    snapshot.synced_at = now


def refresh_own(db: Session, bearer_token: str, user_id: uuid.UUID, *, now: datetime | None = None) -> GrowlioGoalSnapshot:
    """호출자 본인의 growlio 목표를 조회해 저장한다. growlio 미설정·실패는 예외 그대로(전역 핸들러 501/502) —
    기존 저장값은 건드리지 않는다."""
    now = now or now_kst()
    payload = growlio_client.fetch_investment_goal(bearer_token)
    snapshot = db.get(GrowlioGoalSnapshot, user_id)
    if snapshot is None:
        snapshot = GrowlioGoalSnapshot(user_id=user_id)
        db.add(snapshot)
    _apply(snapshot, payload, now)
    combined_goal_service.recompute_required(db)  # growlio 목표금액이 바뀌면 통합 목표의 목표금액도 바뀐다
    db.commit()
    db.refresh(snapshot)
    return snapshot


def household_uses_snapshots(db: Session) -> bool:
    """통합 목표가 없는 가구는 화면 로드마다 growlio를 부르지 않는다."""
    return db.query(FinancialGoal.id).filter(FinancialGoal.kind == combined_goal_service.KIND).first() is not None


def is_stale(snapshot: GrowlioGoalSnapshot | None, now: datetime) -> bool:
    return snapshot is None or snapshot.synced_at < now - STALE_AFTER


def refresh_if_stale(bearer_token: str, user_id: uuid.UUID, *, now: datetime | None = None) -> None:
    """화면 로드 후 BackgroundTasks로 도는 기회주의적 갱신 — 통합 목표가 있고 본인 값이 오래됐을 때만 growlio를
    부른다. 요청 세션은 응답 후 닫히므로 자체 세션을 열고, 절대 raise하지 않는다
    (net_worth_service.refresh_stale_growlio_links와 같은 패턴)."""
    from app.database import SessionLocal

    now = now or now_kst()
    db = SessionLocal()
    try:
        if not household_uses_snapshots(db) or not is_stale(db.get(GrowlioGoalSnapshot, user_id), now):
            return
        refresh_own(db, bearer_token, user_id, now=now)
    except (growlio_client.GrowlioNotConfiguredError, growlio_client.GrowlioRequestError):
        logger.info("growlio_goal_snapshot_unavailable", exc_info=True)
    except Exception:  # fire-and-forget 백그라운드 작업
        db.rollback()
        logger.exception("growlio_goal_snapshot_refresh_failed")
    finally:
        db.close()

