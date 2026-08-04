import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.challenge import Challenge


class ChallengeError(Exception):
    pass


class ChallengeNotFoundError(ChallengeError):
    pass


def list_challenges(db: Session) -> list[Challenge]:
    # "active" sorts before "succeeded" alphabetically, so this naturally groups
    # in-progress challenges first (soonest deadline first), completed ones after.
    return db.query(Challenge).order_by(Challenge.status, Challenge.end_date).all()


def get_challenge(db: Session, challenge_id: int) -> Challenge:
    challenge = db.get(Challenge, challenge_id)
    if challenge is None:
        raise ChallengeNotFoundError("챌린지를 찾을 수 없습니다.")
    return challenge


def create_challenge(
    db: Session,
    created_by_id: uuid.UUID,
    title: str,
    description: str | None,
    target_amount: Decimal,
    start_date: date,
    end_date: date,
) -> Challenge:
    challenge = Challenge(
        title=title,
        description=description,
        target_amount=target_amount,
        start_date=start_date,
        end_date=end_date,
        created_by_id=created_by_id,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    return challenge


def update_challenge(
    db: Session,
    challenge_id: int,
    title: str,
    description: str | None,
    target_amount: Decimal,
    start_date: date,
    end_date: date,
) -> Challenge:
    challenge = get_challenge(db, challenge_id)
    challenge.title = title
    challenge.description = description
    challenge.target_amount = target_amount
    challenge.start_date = start_date
    challenge.end_date = end_date
    db.commit()
    db.refresh(challenge)
    return challenge


def update_progress(
    db: Session, challenge_id: int, current_amount: Decimal, now: datetime | None = None
) -> Challenge:
    """진행 금액을 갱신한다. 목표 금액에 도달하면 succeeded로 전환하고 완료 시각을 기록한다
    (실제 축하 알림 발송 여부는 notification_service.check_and_celebrate_challenge가 별도로 판단한다)."""
    now = now or datetime.now()
    challenge = get_challenge(db, challenge_id)
    challenge.current_amount = current_amount
    if challenge.status == "active" and challenge.target_amount > 0 and current_amount >= challenge.target_amount:
        challenge.status = "succeeded"
        challenge.completed_at = now
    db.commit()
    db.refresh(challenge)
    return challenge


def delete_challenge(db: Session, challenge_id: int) -> None:
    challenge = db.get(Challenge, challenge_id)
    if challenge is not None:
        db.delete(challenge)
        db.commit()


def effective_status(challenge: Challenge, today: date | None = None) -> str:
    """저장된 status에 'expired'(기간 종료 + 미달성)를 얹은 표시용 상태 — 저장하지 않고 읽을 때마다
    계산해서, 만료 처리를 위한 스케줄러 job 없이도 항상 정확하다."""
    today = today or date.today()
    if challenge.status == "active" and today > challenge.end_date:
        return "expired"
    return challenge.status


def to_out(challenge: Challenge, today: date | None = None) -> dict:
    return {
        "id": challenge.id,
        "title": challenge.title,
        "description": challenge.description,
        "target_amount": challenge.target_amount,
        "current_amount": challenge.current_amount,
        "progress_pct": challenge.progress_pct,
        "start_date": challenge.start_date,
        "end_date": challenge.end_date,
        "status": challenge.status,
        "effective_status": effective_status(challenge, today),
        "created_by_id": challenge.created_by_id,
        "completed_at": challenge.completed_at,
        "created_at": challenge.created_at,
        "updated_at": challenge.updated_at,
    }
