from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.challenge import ChallengeCreateIn, ChallengeOut, ChallengeProgressIn, ChallengeUpdateIn
from app.services import challenge_service, notification_service
from app.services.challenge_service import ChallengeNotFoundError
from app.services.google_auth import is_connected

router = APIRouter(prefix="/challenges", tags=["challenges"])


@router.get("", response_model=list[ChallengeOut])
def list_challenges(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [challenge_service.to_out(c) for c in challenge_service.list_challenges(db)]


@router.post("", response_model=ChallengeOut, status_code=status.HTTP_201_CREATED)
def create_challenge(
    payload: ChallengeCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    challenge = challenge_service.create_challenge(
        db,
        current_user.id,
        payload.title,
        payload.description,
        payload.target_amount,
        payload.start_date,
        payload.end_date,
    )
    return challenge_service.to_out(challenge)


@router.put("/{challenge_id}", response_model=ChallengeOut)
def update_challenge(
    challenge_id: int,
    payload: ChallengeUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        challenge = challenge_service.update_challenge(
            db,
            challenge_id,
            payload.title,
            payload.description,
            payload.target_amount,
            payload.start_date,
            payload.end_date,
        )
    except ChallengeNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "챌린지를 찾을 수 없습니다.")
    return challenge_service.to_out(challenge)


@router.put("/{challenge_id}/progress", response_model=ChallengeOut)
def update_progress(
    challenge_id: int,
    payload: ChallengeProgressIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    try:
        challenge = challenge_service.update_progress(db, challenge_id, payload.current_amount)
    except ChallengeNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "챌린지를 찾을 수 없습니다.")
    if is_connected():
        notification_service.check_and_celebrate_challenge(db, challenge.id)
    return challenge_service.to_out(challenge)


@router.delete("/{challenge_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_challenge(challenge_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    challenge_service.delete_challenge(db, challenge_id)
