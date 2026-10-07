import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import bounded_str


class InviteCreateIn(BaseModel):
    email: bounded_str(255)


class InviteAcceptIn(BaseModel):
    display_name: bounded_str(100)


class InviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    invited_by_id: uuid.UUID
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None
    accept_url: str
    email_sent: bool | None = None
