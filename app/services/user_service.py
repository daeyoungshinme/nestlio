from sqlalchemy.orm import Session

from app.models.user import User


def list_users(db: Session) -> list[User]:
    return db.query(User).order_by(User.display_name).all()


def update_display_name(db: Session, user: User, display_name: str) -> User:
    user.display_name = display_name
    db.commit()
    db.refresh(user)
    return user
