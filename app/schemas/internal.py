from typing import Literal

from pydantic import BaseModel


class JobRunOut(BaseModel):
    job: str
    # skipped: 같은 잡의 이전 실행이 아직 도는 중이라 건너뜀(app/scheduler/job_lock.py)
    status: Literal["ok", "skipped"]
