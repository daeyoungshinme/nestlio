"""도메인 예외 베이스. 서비스는 상황에 맞는 하위 클래스를 raise하고, HTTP 상태코드는 클래스의 `status_code`로
정해진다 — `app/exception_handlers.py`가 앱 전역에서 `{"detail": str(exc)}`로 변환하므로 라우터는 이 예외들을
catch해서 HTTPException으로 다시 던지지 않는다.

fastapi를 import하지 않는다(서비스 계층이 웹 프레임워크에 의존하지 않도록). 주 리소스(path param id)를 못 찾으면
None을 돌려 라우터가 404로 바꾸는 기존 관례는 그대로다 — 여기 예외는 라우터가 상태를 구분해야 하는 경우용
(app/services/CLAUDE.md "리소스 없음 처리").
"""


class DomainError(Exception):
    status_code = 400


class InvalidInputError(DomainError):
    status_code = 400


class ForbiddenError(DomainError):
    status_code = 403


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    status_code = 409


class PayloadTooLargeError(DomainError):
    status_code = 413


class UnprocessableError(DomainError):
    status_code = 422


class UpstreamError(DomainError):
    """외부 서비스(growlio·Gmail·Supabase Storage) 호출 실패."""

    status_code = 502


class ServiceUnavailableError(UpstreamError):
    """외부 의존성이 일시적으로 응답하지 않음 — 클라이언트가 잠시 후 재시도하면 되는 상태."""

    status_code = 503


class PartialFailureError(Exception):
    """예약 잡의 항목 루프가 끝까지 돈 뒤 일부 항목이 실패했음을 알린다 — 한 항목 실패가 나머지를 막지 않게 항목마다
    잡고 롤백하되, 로그만 남기고 "ok"로 끝나면 매일 같은 항목이 실패해도 GitHub Actions가 초록불이다. 성공한 항목은
    이미 커밋돼 있다. HTTP 도메인 예외가 아니다(잡 엔드포인트가 500으로 올린다)."""

    def __init__(self, what: str, failed: int, done: int):
        super().__init__(f"{what}: {failed}건 실패, {done}건 처리")
        self.failed = failed
        self.done = done
