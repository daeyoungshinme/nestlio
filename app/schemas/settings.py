from decimal import Decimal

from pydantic import BaseModel


class SettingsOut(BaseModel):
    google_connected: bool
    notify_email_to: str
    budget_warn_pct: float
    budget_critical_pct: float
    emergency_fund_balance: str | None = None
    couple_photo_url: str | None = None


class EmergencyFundIn(BaseModel):
    balance: Decimal


class TestEmailResultOut(BaseModel):
    sent: bool
    message: str
