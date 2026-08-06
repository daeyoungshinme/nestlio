import uuid

from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str


class UserUpdateIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)
