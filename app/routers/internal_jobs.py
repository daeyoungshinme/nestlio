import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import settings
from app.scheduler.jobs import (
    daily_due_date_check,
    daily_threshold_safety_net,
    event_reminder_check,
    monthly_net_worth_snapshot,
    monthly_summary_email,
    weekly_summary_email,
)

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


@router.post("/{job_name}", dependencies=[Depends(_verify_secret)])
def run_job(job_name: str):
    job = JOB_REGISTRY.get(job_name)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown job")
    job()
    return {"job": job_name, "status": "ok"}
