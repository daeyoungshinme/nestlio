from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db, ping

# Render healthCheckPath — `/`(SPA index.html)는 정적 파일이라 DB·API가 죽어도 200이었다. 인증 없음, OpenAPI 밖.
router = APIRouter()


@router.get("/healthz", include_in_schema=False)
def healthz(db: Session = Depends(get_db)) -> dict[str, bool]:
    ping(db)
    return {"ok": True}
