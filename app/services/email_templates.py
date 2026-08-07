"""주간/월간 요약 이메일의 HTML 본문을 조립한다. 이메일 클라이언트 호환성을 위해
테이블 기반 레이아웃 + 인라인 스타일만 사용하고 외부 CSS에 의존하지 않는다."""
from datetime import date
from decimal import Decimal

from app.services.coaching_engine import Insight

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


def _won(amount: Decimal | int) -> str:
    return f"{amount:,.0f}원"


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
<div style="font-size:17px; font-weight:700; color:{color}; margin-top:4px; word-break:break-all;">{_won(amount)}</div>
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
            f"{_TYPE_LABELS[key]} {_won(amount)} ({pct}%)</span>"
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
<td align="right" style="font-size:13px; font-weight:600; color:{_TEXT}; white-space:nowrap;">{_won(row['amount'])}</td>
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


def build_weekly_summary_html(start: date, end: date, totals: dict, breakdown: list[dict]) -> str:
    body = (
        _stat_row(totals["income"], totals["expense"], totals["savings"])
        + _section_title("지출 구성")
        + _type_breakdown_bar(totals["fixed"], totals["variable"], totals["irregular"])
        + _section_title("카테고리별 지출")
        + _category_bars(breakdown)
    )
    subtitle = f"{start.isoformat()} ~ {end.isoformat()}"
    return _shell(f"이번 주 지출 {_won(totals['expense'])}", "주간 가계부 요약", subtitle, body)


def build_monthly_summary_html(
    start: date, end: date, totals: dict, breakdown: list[dict], insights: list[Insight]
) -> str:
    body = (
        _stat_row(totals["income"], totals["expense"], totals["savings"])
        + _section_title("지출 구성")
        + _type_breakdown_bar(totals["fixed"], totals["variable"], totals["irregular"])
        + _section_title("카테고리별 지출")
        + _category_bars(breakdown)
    )
    if insights:
        body += _section_title("자산증식 코칭") + _insight_cards(insights)
    subtitle = f"{start.isoformat()} ~ {end.isoformat()}"
    return _shell(f"이번 달 지출 {_won(totals['expense'])}", "월간 가계부 요약", subtitle, body)
