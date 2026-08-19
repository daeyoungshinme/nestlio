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
    benchmark_food_warn_pct: float
    benchmark_housing_warn_pct: float
    benchmark_communication_warn_pct: float
    benchmark_transport_warn_pct: float
    benchmark_leisure_warn_pct: float
    benchmark_healthcare_warn_pct: float
    benchmark_education_warn_pct: float
    benchmark_insurance_warn_pct: float


class CoachingThresholdsIn(BaseModel):
    savings_rate_warn: float = Field(ge=0, le=999)
    savings_rate_critical: float = Field(ge=0, le=999)
    fixed_cost_ratio_warn: float = Field(ge=0, le=999)
    fixed_cost_ratio_critical: float = Field(ge=0, le=999)
    budget_warn_pct: float = Field(ge=0, le=999)
    budget_critical_pct: float = Field(ge=0, le=999)
    discretionary_ratio_warn: float = Field(ge=0, le=999)
    debt_ratio_warn: float = Field(ge=0, le=999)
    benchmark_food_warn_pct: float = Field(ge=0, le=999)
    benchmark_housing_warn_pct: float = Field(ge=0, le=999)
    benchmark_communication_warn_pct: float = Field(ge=0, le=999)
    benchmark_transport_warn_pct: float = Field(ge=0, le=999)
    benchmark_leisure_warn_pct: float = Field(ge=0, le=999)
    benchmark_healthcare_warn_pct: float = Field(ge=0, le=999)
    benchmark_education_warn_pct: float = Field(ge=0, le=999)
    benchmark_insurance_warn_pct: float = Field(ge=0, le=999)


class NotificationPrefsOut(BaseModel):
    email_weekly: bool
    email_monthly: bool
    threshold_alert: bool
    goal_milestone: bool
    challenge_success: bool
    event_reminder: bool


class NotificationPrefsIn(NotificationPrefsOut):
    pass


class SettingsOut(BaseModel):
    google_connected: bool
    notify_emails: list[str]
    coaching_thresholds: CoachingThresholdsOut
    notification_prefs: NotificationPrefsOut
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
