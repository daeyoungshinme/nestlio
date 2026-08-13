from typing import Literal

from pydantic import BaseModel


class JobRunOut(BaseModel):
    job: str
    status: Literal["ok"]
