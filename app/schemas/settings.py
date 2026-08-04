from decimal import Decimal

from pydantic import BaseModel


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
    notify_email_to: str
    coaching_thresholds: CoachingThresholdsOut
    emergency_fund_balance: str | None = None
    couple_photo_url: str | None = None


class EmergencyFundIn(BaseModel):
    balance: Decimal


class TestEmailResultOut(BaseModel):
    sent: bool
    message: str
