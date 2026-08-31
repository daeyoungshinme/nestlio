"""지난달(가장 최근 완결된 달) 회고 데이터의 단일 소스. 대시보드의 월간 회고 카드
(app/routers/dashboard.py::monthly_retrospective)와 월간 요약 이메일
(app/services/notification_service.py::send_monthly_summary)이 같은 기간·집계를 쓰던 것을
여기 하나로 모았다 — 이메일은 이 결과에 저축 스트릭·부부 기여도 문구를 얹고 HTML로 렌더한다.
"""
from datetime import date

from sqlalchemy.orm import Session

from app.services import coaching_engine, transaction_report_service
from app.utils.dates import month_bounds, shift_month, year_month_str


def build(db: Session, today: date) -> dict:
    start, end = month_bounds(shift_month(today, -1))
    year_month = year_month_str(start)
    totals = transaction_report_service.period_totals(db, start, end)
    owner_totals = transaction_report_service.totals_by_owner(db, start, end)
    breakdown = transaction_report_service.category_breakdown(db, start, end, "expense")
    insights = coaching_engine.compute_insights(db, year_month, totals=totals, breakdown=breakdown)
    return {
        "year_month": year_month,
        "start": start,
        "end": end,
        "totals": totals,
        "owner_totals": owner_totals,
        "breakdown": breakdown,
        "top_categories": breakdown[:3],
        "insights": insights,
    }
