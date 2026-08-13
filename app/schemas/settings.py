import re

from pydantic import BaseModel, Field, field_validator

MAX_NOTIFY_RECIPIENTS = 5
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class CoachingThresholdsOut(BaseModel):
    savings_rate_warn: float
    savings_rate_critical: float
    fixed_cost_ratio_warn: float
    fixed_cost_ratio_critical: float
    budget_warn_pct: float
    budget_critical_pct: float
    discretionary_ratio_warn: float
    debt_ratio_warn: float


class CoachingThresholdsIn(CoachingThresholdsOut):
    pass


class SettingsOut(BaseModel):
    google_connected: bool
    notify_emails: list[str]
    coaching_thresholds: CoachingThresholdsOut
    couple_photo_url: str | None = None


class NotifyEmailsIn(BaseModel):
    emails: list[str] = Field(min_length=1, max_length=MAX_NOTIFY_RECIPIENTS)

    @field_validator("emails")
    @classmethod
    def _normalize(cls, emails: list[str]) -> list[str]:
        normalized: dict[str, None] = {}
        for raw in emails:
            email = raw.strip().lower()
            if not _EMAIL_RE.match(email):
                raise ValueError(f"'{raw}'는 올바른 이메일 형식이 아닙니다.")
            normalized.setdefault(email, None)
        return list(normalized)


class TestEmailResultOut(BaseModel):
    sent: bool
    message: str
