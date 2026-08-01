from pathlib import Path

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.scheduler.jobs import (
    daily_due_date_check,
    daily_threshold_safety_net,
    event_reminder_check,
    monthly_net_worth_snapshot,
    monthly_summary_email,
    weekly_summary_email,
)

_JOBSTORE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "scheduler_jobs.db"
scheduler = AsyncIOScheduler(
    jobstores={"default": SQLAlchemyJobStore(url=f"sqlite:///{_JOBSTORE_PATH}")}
)


def start_scheduler() -> None:
    scheduler.add_job(
        daily_due_date_check, "cron", hour=7, minute=0, id="daily_due_date_check", replace_existing=True
    )
    scheduler.add_job(
        weekly_summary_email,
        "cron",
        day_of_week="mon",
        hour=8,
        minute=0,
        id="weekly_summary_email",
        replace_existing=True,
    )
    scheduler.add_job(
        monthly_summary_email,
        "cron",
        day=1,
        hour=8,
        minute=0,
        id="monthly_summary_email",
        replace_existing=True,
    )
    scheduler.add_job(
        monthly_net_worth_snapshot,
        "cron",
        day=1,
        hour=8,
        minute=5,
        id="monthly_net_worth_snapshot",
        replace_existing=True,
    )
    scheduler.add_job(
        daily_threshold_safety_net,
        "cron",
        hour=20,
        minute=0,
        id="daily_threshold_safety_net",
        replace_existing=True,
    )
    scheduler.add_job(
        event_reminder_check,
        "interval",
        minutes=15,
        id="event_reminder_check",
        replace_existing=True,
    )
    scheduler.start()


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
