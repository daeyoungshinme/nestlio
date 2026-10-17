"""알림 메일의 제목·본문 조립 — 발송·dedup은 notification_service, 여기는 문자열만 만든다.

- 텍스트 본문: 모든 알림 메일의 기본 파트이자 인앱 알림(NotificationLog.detail)에 그대로 남는 문구.
- HTML 본문: 주간/월간 요약만. 이메일 클라이언트 호환성을 위해 테이블 기반 레이아웃 +
  인라인 스타일만 사용하고 외부 CSS에 의존하지 않는다.
"""
from datetime import date, datetime
from decimal import Decimal

from app.services import transaction_report_service
from app.services.coaching_engine import Insight
from app.utils.money import format_won

_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"

_PRIMARY = "#2563EB"
_SUCCESS = "#16A34A"
_DANGER = "#DC2626"
_WARNING = "#D97706"
_INFO = "#0891B2"
_TEXT = "#111827"
_MUTED = "#6B7280"
_BORDER = "#E5E7EB"
_CARD_BG = "#FFFFFF"
_PAGE_BG = "#F3F4F6"

_TYPE_LABELS = {"fixed": "고정지출", "variable": "변동지출", "irregular": "비정기지출"}
_TYPE_COLORS = {"fixed": _PRIMARY, "variable": _INFO, "irregular": _MUTED}
_SEVERITY_LABELS = {"critical": "위험", "warning": "주의", "info": "참고"}
# frontend/src/utils/colors.ts의 INSIGHT_SEVERITY_STYLE(light 모드)과 동일한 톤으로 맞춘다.
_SEVERITY_COLORS = {"critical": "#B91C1C", "warning": "#B45309", "info": "#1D4ED8"}
_SEVERITY_TINTS = {"critical": "#FEF2F2", "warning": "#FFFBEB", "info": "#EFF6FF"}



def _shell(preheader: str, header_title: str, header_subtitle: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{header_title}</title>
</head>
<body style="margin:0; padding:0; background-color:{_PAGE_BG}; font-family:{_FONT};">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:{_PAGE_BG}; padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:{_CARD_BG}; border-radius:12px; overflow:hidden; border:1px solid {_BORDER};">
<tr>
<td style="background-color:{_PRIMARY}; padding:28px 32px;">
<div style="color:#FFFFFF; font-size:13px; font-weight:600; letter-spacing:0.04em; opacity:0.85;">NESTLIO</div>
<div style="color:#FFFFFF; font-size:22px; font-weight:700; margin-top:6px;">{header_title}</div>
<div style="color:#FFFFFF; font-size:14px; margin-top:4px; opacity:0.9;">{header_subtitle}</div>
</td>
</tr>
<tr><td style="padding:24px 32px 8px;">
{body_html}
</td></tr>
<tr>
<td style="padding:20px 32px 28px;">
<div style="border-top:1px solid {_BORDER}; padding-top:16px; color:{_MUTED}; font-size:12px; line-height:1.6;">
이 메일은 nestlio 설정의 알림에 따라 자동 발송되었습니다.<br>
알림 설정은 앱의 설정 메뉴에서 변경할 수 있습니다.
</div>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def _section_title(text: str) -> str:
    return (
        f'<div style="font-size:14px; font-weight:700; color:{_TEXT}; '
        f'margin:20px 0 10px;">{text}</div>'
    )


def _stat_row(income: Decimal, expense: Decimal, savings: Decimal) -> str:
    savings_color = _SUCCESS if savings >= 0 else _DANGER

    def _tile(label: str, amount: Decimal, color: str) -> str:
        return f"""<td width="33%" valign="top" style="padding:14px 10px; text-align:center; background-color:#F9FAFB; border-radius:10px;">
<div style="font-size:12px; color:{_MUTED}; font-weight:600;">{label}</div>
<div style="font-size:17px; font-weight:700; color:{color}; margin-top:4px; word-break:break-all;">{format_won(amount)}</div>
</td>"""

    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
{_tile("수입", income, _TEXT)}
<td width="3%"></td>
{_tile("지출", expense, _TEXT)}
<td width="3%"></td>
{_tile("저축", savings, savings_color)}
</tr>
</table>"""


def _type_breakdown_bar(fixed: Decimal, variable: Decimal, irregular: Decimal) -> str:
    total = fixed + variable + irregular
    segments = [("fixed", fixed), ("variable", variable), ("irregular", irregular)]
    if total <= 0:
        bar_cells = f'<td style="background-color:{_BORDER}; height:10px; font-size:0;">&nbsp;</td>'
    else:
        cells = []
        for key, amount in segments:
            if amount <= 0:
                continue
            pct = max(int(amount / total * 100), 1)
            cells.append(
                f'<td width="{pct}%" style="background-color:{_TYPE_COLORS[key]}; height:10px; font-size:0;">&nbsp;</td>'
                f'<td width="2" style="background-color:{_CARD_BG}; height:10px; font-size:0;">&nbsp;</td>'
            )
        bar_cells = "".join(cells)

    legend_items = []
    for key, amount in segments:
        pct = int(amount / total * 100) if total > 0 else 0
        legend_items.append(
            f'<span style="display:inline-block; margin-right:16px; font-size:12px; color:{_MUTED};">'
            f'<span style="display:inline-block; width:8px; height:8px; border-radius:2px; '
            f'background-color:{_TYPE_COLORS[key]}; margin-right:5px;"></span>'
            f"{_TYPE_LABELS[key]} {format_won(amount)} ({pct}%)</span>"
        )

    return f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px; overflow:hidden; margin-top:2px;">
<tr>{bar_cells}</tr>
</table>
<div style="margin-top:10px; line-height:1.9;">{"".join(legend_items)}</div>"""


def _category_bars(breakdown: list[dict]) -> str:
    if not breakdown:
        return f'<div style="font-size:13px; color:{_MUTED}; padding:8px 0;">이 기간 지출 내역이 없어요.</div>'

    max_amount = max((row["amount"] for row in breakdown), default=Decimal("0")) or Decimal("1")
    rows_html = []
    for row in breakdown:
        pct = max(int(row["amount"] / max_amount * 100), 4)
        color = row.get("color") or _MUTED
        rows_html.append(f"""<tr>
<td style="padding:7px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:13px; color:{_TEXT};">
<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:{color}; margin-right:7px;"></span>
{row['name']}
</td>
<td align="right" style="font-size:13px; font-weight:600; color:{_TEXT}; white-space:nowrap;">{format_won(row['amount'])}</td>
</tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:5px;">
<tr>
<td width="{pct}%" style="background-color:{color}; height:6px; border-radius:3px; font-size:0;">&nbsp;</td>
<td style="height:6px; font-size:0;">&nbsp;</td>
</tr>
</table>
</td>
</tr>""")
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{"".join(rows_html)}</table>'


def _streak_banner(streak: int) -> str:
    if streak <= 0:
        return ""
    return f"""<div style="margin:4px 0 14px; padding:10px 14px; background-color:#FFFBEB; border-radius:8px; font-size:13px; color:{_WARNING}; font-weight:600;">
\U0001F525 연속 {streak}개월째 목표 페이스를 지키고 있어요
</div>"""


def _contribution_section(owner_totals: list[dict] | None) -> str:
    """부부 각자의 저축 기여도 비교 — 이메일이 "혼자 보는 경고"가 아니라 "함께 보는 성과
    요약"이 되도록, 대시보드 CoupleContributionCard와 같은 축(owner_user_id 기준 저축액)으로
    누가 이번 기간 더 모았는지 보여준다. "공통" 항목과 1인 가구는 비교 대상이 아니므로 생략
    (정렬·리더 판정은 transaction_report_service.rank_owner_contributions 공유)."""
    if not owner_totals:
        return ""
    ranked = transaction_report_service.rank_owner_contributions(owner_totals)
    if ranked is None:
        return ""
    rows = []
    for o in ranked:
        is_leader = o["is_leader"]
        crown = " \U0001F451" if is_leader else ""
        color = _SUCCESS if is_leader else _TEXT
        rows.append(f"""<tr>
<td style="padding:6px 0; font-size:13px; color:{_TEXT};">{o['display_name']}{crown}</td>
<td align="right" style="padding:6px 0; font-size:13px; font-weight:700; color:{color};">{format_won(o['savings'])}</td>
</tr>""")
    return (
        _section_title("부부 저축 기여도")
        + f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{"".join(rows)}</table>'
    )


def _insight_cards(insights: list[Insight]) -> str:
    if not insights:
        return ""
    cards = []
    for insight in insights:
        color = _SEVERITY_COLORS.get(insight.severity, _MUTED)
        tint = _SEVERITY_TINTS.get(insight.severity, "#F9FAFB")
        label = _SEVERITY_LABELS.get(insight.severity, insight.severity)
        cards.append(f"""<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
<tr>
<td width="4" style="background-color:{color}; border-radius:3px 0 0 3px; font-size:0;">&nbsp;</td>
<td style="background-color:{tint}; border-radius:0 6px 6px 0; padding:10px 14px;">
<span style="display:inline-block; font-size:11px; font-weight:700; color:{color}; border:1px solid {color}; border-radius:10px; padding:1px 8px; margin-bottom:4px;">{label}</span>
<div style="font-size:13px; color:{_TEXT}; line-height:1.5; margin-top:4px;">{insight.message}</div>
</td>
</tr>
</table>""")
    return "".join(cards)


def _summary_body(totals: dict, breakdown: list[dict], owner_totals: list[dict] | None, streak: int) -> str:
    """주간·월간 요약 HTML의 공통 본문 — 월간은 여기에 코칭 인사이트 카드만 덧붙인다."""
    return (
        _streak_banner(streak)
        + _stat_row(totals["income"], totals["expense"], totals["savings"])
        + _contribution_section(owner_totals)
        + _section_title("지출 구성")
        + _type_breakdown_bar(totals["fixed"], totals["variable"], totals["irregular"])
        + _section_title("카테고리별 지출")
        + _category_bars(breakdown)
    )


def build_weekly_summary_html(
    start: date,
    end: date,
    totals: dict,
    breakdown: list[dict],
    owner_totals: list[dict] | None = None,
    streak: int = 0,
) -> str:
    body = _summary_body(totals, breakdown, owner_totals, streak)
    subtitle = f"{start.isoformat()} ~ {end.isoformat()}"
    return _shell(f"이번 주 지출 {format_won(totals['expense'])}", "주간 가계부 요약", subtitle, body)


def build_monthly_summary_html(
    start: date,
    end: date,
    totals: dict,
    breakdown: list[dict],
    insights: list[Insight],
    owner_totals: list[dict] | None = None,
    streak: int = 0,
) -> str:
    body = _summary_body(totals, breakdown, owner_totals, streak)
    if insights:
        body += _section_title("자산증식 코칭") + _insight_cards(insights)
    subtitle = f"{start.isoformat()} ~ {end.isoformat()}"
    return _shell(f"이번 달 지출 {format_won(totals['expense'])}", "월간 가계부 요약", subtitle, body)


# ---- 텍스트 본문 ----


def contribution_summary_text(owner_totals: list[dict]) -> str | None:
    """부부 각자의 저축 기여도를 한 줄로 — HTML의 _contribution_section과 같은 축·같은 규칙
    ("공통" 항목과 1인 가구는 생략, 정렬·리더 판정은 transaction_report_service.rank_owner_contributions)."""
    ranked = transaction_report_service.rank_owner_contributions(owner_totals)
    if ranked is None:
        return None
    parts = [f"{o['display_name']} {o['savings']:,.0f}원" for o in ranked]
    line = "부부 저축 기여도: " + " · ".join(parts)
    leader = next((o for o in ranked if o["is_leader"]), None)
    if leader:
        line += f" — {leader['display_name']}님이 이번엔 더 모았어요"
    return line


def summary_text(
    title: str,
    start: date,
    end: date,
    totals: dict,
    breakdown: list[dict],
    *,
    owner_totals: list[dict],
    streak: int,
    insights: list[Insight] | None = None,
) -> str:
    """주간·월간 요약의 텍스트 본문(HTML 대체 파트 겸 인앱 알림 detail). 월간만 insights를 넘긴다."""
    lines = [
        f"{title} ({start} ~ {end})",
        "",
        f"수입: {totals['income']:,.0f}원",
        f"지출: {totals['expense']:,.0f}원",
        f"  - 고정지출: {totals['fixed']:,.0f}원",
        f"  - 변동지출: {totals['variable']:,.0f}원",
        f"  - 비정기지출: {totals['irregular']:,.0f}원",
        f"저축(수입-지출): {totals['savings']:,.0f}원",
        "",
        "카테고리별 지출:",
    ]
    lines.extend(f"  - {row['name']}: {row['amount']:,.0f}원" for row in breakdown)
    body = "\n".join(lines)

    extra_lines = []
    if streak > 0:
        extra_lines.append(f"연속 {streak}개월째 목표 페이스를 지키고 있어요 \U0001F525")
    contribution_text = contribution_summary_text(owner_totals)
    if contribution_text:
        extra_lines.append(contribution_text)
    if extra_lines:
        body += "\n\n" + "\n".join(extra_lines)

    if insights:
        body += "\n\n자산증식 코칭:\n"
        body += "\n".join(f"  - [{i.severity}] {i.message}" for i in insights)
    return body


def threshold_alert_message(row: dict) -> tuple[str, str]:
    """(제목, 본문) — budget_vs_actual 한 행이 warn/critical에 들어섰을 때."""
    level = "위험" if row["status"] == "critical" else "주의"
    body = (
        f"{row['name']} 카테고리 예산 {level} 알림\n\n"
        f"예산: {row['budget']:,.0f}원\n"
        f"실제 지출: {row['actual']:,.0f}원 ({row['pct']:.0f}%)"
    )
    return f"[Nestlio] 예산 {level} - {row['name']}", body


def goal_milestone_message(goal, milestone: int, current_amount: Decimal, today: date) -> tuple[str, str]:
    """(제목, 본문) — 챌린지는 100% 성공 한 번, 일반 목표는 25/50/75/100% 마일스톤마다."""
    if goal.kind == "challenge":
        body = (
            f'\U0001F389 "{goal.name}" 챌린지 성공! \U0001F389\n\n'
            f"목표 {goal.required_amount:,.0f}원을 두 분이 함께 달성했어요!\n\n"
            f"현재: {current_amount:,.0f}원 / 목표 {goal.required_amount:,.0f}원"
        )
        return f"[Nestlio] 챌린지 성공 - {goal.name}", body

    congrats = "드디어 목표를 이뤘어요! 두 분이 함께 만든 결과예요." if milestone >= 100 else "두 분이 함께 여기까지 왔어요, 축하해요!"
    body = (
        f'\U0001F389 "{goal.name}" 목표 {milestone}% 달성! \U0001F389\n\n'
        f"{congrats}\n\n"
        f"현재 저축액: {current_amount:,.0f}원 / 목표 {goal.required_amount:,.0f}원"
    )
    if milestone < 100 and goal.target_date is not None:
        remaining_amount = max(goal.required_amount - current_amount, 0)
        remaining_days = (goal.target_date - today).days
        if remaining_days > 0:
            body += f"\n목표일까지 D-{remaining_days}, 이제 {remaining_amount:,.0f}원만 더 모으면 돼요."
    return f"[Nestlio] 우리 부부 목표 달성 축하 - {goal.name} {milestone}%", body


def savings_pace_reminder_message(planned: Decimal, remaining: Decimal, streak: int) -> tuple[str, str]:
    body = f"이번 달 저축·투자 계획 {planned:,.0f}원 중 {remaining:,.0f}원이 남았어요. 월말 전에 함께 채워봐요!"
    if streak > 0:
        body += f" 지금까지 {streak}개월 연속 달성 중이에요."
    return "[Nestlio] 이번 달 저축 계획까지 조금 남았어요", body


def invite_message(accept_url: str, expiry_days: int) -> tuple[str, str]:
    body = (
        "nestlio에 배우자로 초대되었습니다.\n\n"
        f"아래 링크에서 계정을 만들어주세요 ({expiry_days}일 이내 유효):\n{accept_url}"
    )
    return "[Nestlio] 배우자 초대", body


def event_summary_text(event, when: datetime, header: str | None = None) -> str:
    """일정 리마인더·배우자 일정 알림 본문. header는 "새 일정이 등록되었습니다" 같은 행위 문구."""
    lines = [header] if header else []
    lines.append(event.title)
    lines.append(f"일시: {when.strftime('%Y-%m-%d %H:%M')}")
    if event.location:
        lines.append(f"장소: {event.location}")
    if event.description:
        lines.append("")
        lines.append(event.description)
    return "\n".join(lines)
