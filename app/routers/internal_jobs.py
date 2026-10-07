import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import settings
from app.scheduler.job_lock import job_lock
from app.scheduler.jobs import (
    daily_due_date_check,
    daily_threshold_safety_net,
    event_reminder_check,
    monthly_net_worth_snapshot,
    monthly_summary_email,
    weekly_summary_email,
)
from app.schemas.internal import JobRunOut

router = APIRouter(prefix="/internal/jobs", tags=["internal"])

JOB_REGISTRY = {
    "daily-due-date-check": daily_due_date_check,
    "weekly-summary-email": weekly_summary_email,
    "monthly-summary-email": monthly_summary_email,
    "daily-threshold-safety-net": daily_threshold_safety_net,
    "monthly-net-worth-snapshot": monthly_net_worth_snapshot,
    "event-reminder-check": event_reminder_check,
}


def _verify_secret(x_internal_job_secret: str | None = Header(default=None)) -> None:
    configured = settings.internal_job_secret
    if not configured or not x_internal_job_secret or not hmac.compare_digest(
        x_internal_job_secret, configured
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid job secret")


@router.post("/{job_name}", dependencies=[Depends(_verify_secret)], response_model=JobRunOut)
def run_job(job_name: str):
    job = JOB_REGISTRY.get(job_name)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown job")
    with job_lock(job_name) as acquired:
        if not acquired:
            # curl 재시도가 아직 도는 첫 실행과 겹친 경우 — 첫 실행이 일을 끝내므로 성공(200)으로 돌려
            # 워크플로를 실패로 만들지 않는다. 첫 실행이 실패하면 그쪽이 로그를 남긴다.
            return {"job": job_name, "status": "skipped"}
        try:
            job()
        except Exception as exc:
            # 예외 클래스명을 detail에 싣는다 — GitHub Actions 로그(curl)만으로 원인 갈래를 알 수 있게.
            # 메시지 본문은 싣지 않는다(시크릿 보호 엔드포인트지만 내부 상세가 로그에 남는 것을 피함).
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR, f"job '{job_name}' failed: {type(exc).__name__}"
            ) from exc
    return {"job": job_name, "status": "ok"}
