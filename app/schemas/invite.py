import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class InviteCreateIn(BaseModel):
    email: str


class InviteAcceptIn(BaseModel):
    display_name: str


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
