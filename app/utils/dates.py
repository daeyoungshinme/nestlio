from calendar import monthrange
from datetime import date, timedelta


def week_bounds(d: date) -> tuple[date, date]:
    start = d - timedelta(days=d.weekday())
    end = start + timedelta(days=6)
    return start, end


def year_bounds(year: int) -> tuple[date, date]:
    return date(year, 1, 1), date(year, 12, 31)


def month_bounds(d: date) -> tuple[date, date]:
    start = d.replace(day=1)
    if d.month == 12:
        end = d.replace(year=d.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        end = d.replace(month=d.month + 1, day=1) - timedelta(days=1)
    return start, end


def shift_month(d: date, delta: int) -> date:
    month_index = d.month - 1 + delta
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, 1)


def year_month_str(d: date) -> str:
    return d.strftime("%Y-%m")


def parse_year_month(s: str) -> date:
    year, month = s.split("-")
    return date(int(year), int(month), 1)


def months_remaining_in_year(d: date) -> int:
    """`d`가 속한 연도의 12월까지 남은 개월 수 (자기 자신 포함). 예: 8월 -> 5 (8,9,10,11,12)."""
    return 13 - d.month


def add_months_with_day(d: date, months: int, day: int) -> date:
    """Advance `d` by `months`, landing on `day` (clamped to the target month's length).

    Anchoring on the caller-supplied `day` (rather than d.day) prevents drift when a
    short month clamps the date down (e.g. Jan 31 -> Feb 28 -> back up to Mar 31, not Mar 28).
    """
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    clamped_day = min(day, monthrange(year, month)[1])
    return date(year, month, clamped_day)


def advance_due_date(current: date, frequency: str, day_of_month: int | None) -> date:
    if frequency == "weekly":
        return current + timedelta(days=7)
    if frequency == "monthly":
        return add_months_with_day(current, 1, day_of_month or current.day)
    if frequency == "yearly":
        return add_months_with_day(current, 12, day_of_month or current.day)
    raise ValueError(f"unknown frequency: {frequency}")
