from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.errors import DomainError


def register_exception_handlers(app: FastAPI) -> None:
    """도메인 예외(app/errors.py) → HTTP 응답 매핑을 앱 전역에서 한 번만 처리한다. 하위 클래스도 MRO로 이
    핸들러에 걸린다.

    FastAPI의 기본 HTTPException 핸들러와 같은 응답 형식({"detail": ...})을 직접 반환한다 - exception_handler
    안에서 HTTPException을 raise하면 그 핸들러 밖으로 예외가 그대로 전파되어 500으로 떨어지므로 쓰지 않는다.
    """

    @app.exception_handler(DomainError)
    def _domain_error(request: Request, exc: DomainError):
        return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})
