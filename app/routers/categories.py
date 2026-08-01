from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.category import CategoryCreateIn, CategoryOut, CategoryUpdateIn
from app.services import category_service

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(
    kind: Literal["income", "expense"] | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return category_service.list_categories(db, kind=kind)


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return category_service.create_category(db, payload.name, payload.type, payload.color, payload.kind)


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    payload: CategoryUpdateIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    category = category_service.update_category(
        db, category_id, payload.name, payload.type, payload.color, payload.kind
    )
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.post("/{category_id}/deactivate", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_category(category_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    category_service.deactivate_category(db, category_id)
