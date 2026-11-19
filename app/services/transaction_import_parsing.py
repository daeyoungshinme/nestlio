"""CSV 가져오기의 칸 해석 — 날짜·금액·결제수단 파싱, 메모 정규화·유사도, 헤더 → 칸 번호, 계좌·카드·소유자 이름 매칭.
DB를 건드리지 않는 순수 함수(이름 매칭은 호출부가 조회한 목록을 받는다). 흐름은 `transaction_import_service`."""

import re
from collections.abc import Iterable
from datetime import date
from decimal import Decimal, InvalidOperation

from app.constants.payment_methods import PAYMENT_METHOD_LABELS, PAYMENT_METHODS
from app.errors import InvalidInputError
from app.models.account import Account
from app.models.card import Card
from app.models.user import User

# 부분 일치로 쓸 학습 메모의 최소 길이 — 한 글자("커")는 거의 모든 메모에 들어가 엉뚱하게 매칭된다.
MEMO_PARTIAL_MATCH_MIN_LENGTH = 2

# Transaction.amount = Numeric(12,2). 이 경로는 스키마 KrwAmount를 거치지 않으므로 같은 범위를 여기서 본다.
AMOUNT_LIMIT = Decimal(10) ** 10

# 은행·카드 앱 CSV의 날짜: 2026-10-26, 2026.10.26, 2026/10/26, 2026. 10. 26., 20261026 — 뒤에 시각이 붙어도 된다.
_DATE_RE = re.compile(r"(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?(?:\s.*)?|(\d{4})(\d{2})(\d{2})")


def parse_date(raw: str) -> date:
    m = _DATE_RE.fullmatch(raw.strip())
    if m is None:
        raise ValueError(f"날짜 형식을 읽을 수 없습니다: '{raw.strip()}' (예: 2026-10-26, 2026.10.26)")
    y, mo, d = (int(g) for g in (m.groups()[:3] if m.group(1) else m.groups()[3:]))
    try:
        return date(y, mo, d)
    except ValueError:
        raise ValueError(f"없는 날짜입니다: '{raw.strip()}'") from None


def parse_amount(raw: str) -> Decimal:
    """천 단위 쉼표·'원'·공백을 허용한다(12,000원)."""
    cleaned = re.sub(r"[,\s원₩]", "", raw)
    try:
        amount = Decimal(cleaned)
    except InvalidOperation:
        raise ValueError(f"금액을 읽을 수 없습니다: '{raw.strip()}'") from None
    if not amount.is_finite():  # NaN·Infinity도 Decimal로는 파싱된다
        raise ValueError(f"금액을 읽을 수 없습니다: '{raw.strip()}'")
    if amount < 0:
        raise ValueError(f"음수 금액은 가져오지 않습니다(취소·환불 내역은 직접 정리해 주세요): '{raw.strip()}'")
    if amount >= AMOUNT_LIMIT:
        raise ValueError(f"금액이 너무 큽니다: '{raw.strip()}'")
    if amount.as_tuple().exponent < -2:
        raise ValueError(f"금액은 소수 둘째 자리까지 받습니다: '{raw.strip()}'")
    return amount


def normalize_memo(memo: str | None) -> str:
    return re.sub(r"\s+", " ", (memo or "").strip()).casefold()


def similar_memo(a: str, b: str) -> bool:
    """정규화한 두 메모가 같거나, 짧은 쪽(2자 이상)이 긴 쪽에 들어 있으면 비슷하다.
    빈 메모는 무엇과도 비슷하지 않다 — 메모 없는 별개 지출이 합쳐지거나 중복으로 빠지지 않게."""
    if not a or not b:
        return False
    short, long_ = sorted((a, b), key=len)
    return short == long_ or (len(short) >= MEMO_PARTIAL_MATCH_MIN_LENGTH and short in long_)

# 결제수단 칸 → payment_method. 앞에서부터 먼저 걸리는 규칙("체크카드"는 "카드"보다 먼저).
# 영문 값(cash 등)은 그대로 받는다. 어느 것에도 안 걸리는 비어 있지 않은 값은 "other".
PAYMENT_METHOD_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("체크", "직불", "debit"), "debit_card"),
    (("신용", "카드", "credit"), "credit_card"),
    (("현금", "cash"), "cash"),
    (("이체", "송금", "계좌", "transfer"), "transfer"),
)


def parse_payment_method(raw: str) -> str | None:
    key = normalize_memo(raw)
    if not key:
        return None
    if key in PAYMENT_METHODS:
        return key
    return next((method for words, method in PAYMENT_METHOD_RULES if any(w in key for w in words)), "other")


# 결제수단 칸에서 카드 이름을 찾지 않을 일반 표기 — "신용카드"가 "신한카드" 같은 카드 이름과 부분 일치하지 않게
GENERIC_PAYMENT_LABELS = {
    normalize_memo(label) for label in (*PAYMENT_METHOD_LABELS, *PAYMENT_METHOD_LABELS.values(), "카드", "신용", "체크")
}


class NameIndex[T: (Account, Card)]:
    """계좌·카드 칸 → 활성 계좌·카드. 이름이 정규화 후 같으면 그것(같은 이름이 여럿이면 앞의 것), 아니면 서로
    포함하는(2자 이상) 것 중 이름이 가장 긴 것("신한카드" ↔ "신한카드(본인)"). 이름 정규화는 가져오기마다 한 번만 한다."""

    def __init__(self, items: Iterable[T]):
        self._names = [(normalize_memo(a.name), a) for a in items if a.is_active]
        self._exact: dict[str, T] = {}
        for name, a in self._names:
            self._exact.setdefault(name, a)

    def match(self, raw: str) -> T | None:
        key = normalize_memo(raw)
        if not key:
            return None
        if (exact := self._exact.get(key)) is not None:
            return exact
        partial = [(len(name), a) for name, a in self._names if similar_memo(name, key)]
        return max(partial, key=lambda p: p[0])[1] if partial else None


def resolve_card(raw_card: str, raw_account: str, raw_payment: str, cards: NameIndex[Card]) -> Card | None:
    """카드 칸 → (계좌로 못 찾은) 계좌 칸 → 결제수단 칸 순으로 카드를 찾는다. 카드 칸이 채워져 있으면 그것만 본다."""
    if raw_card:
        return cards.match(raw_card)
    if (card := cards.match(raw_account)) is not None:
        return card
    if normalize_memo(raw_payment) in GENERIC_PAYMENT_LABELS:
        return None
    return cards.match(raw_payment)


# 소유자 칸의 공통 표기 — 화면(common/OwnerSelect)에서 소유자 없음(None)을 "공통"으로 보여준다.
COMMON_OWNER_LABEL = "공통"
COMMON_OWNER_ALIASES = {"공통", "공동", "함께"}


def match_owner(raw: str, users: list[User]) -> User | None:
    """소유자 칸 → 가구 사용자(표시 이름, 없으면 이메일 정규화 일치). 공통 표기는 호출부가 먼저 거른다."""
    key = normalize_memo(raw)
    return next((u for u in users if normalize_memo(u.display_name) == key), None) or next(
        (u for u in users if normalize_memo(u.email) == key), None
    )


# 헤더가 있으면 이름으로 칸을 찾는다(순서가 달라도 됨). 없으면 CSV_HEADER 순서로 읽는다.
COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "date": ("날짜", "거래일", "거래일자", "이용일", "이용일자"),
    "type": ("구분",),
    "category": ("카테고리", "분류"),
    "amount": ("금액", "이용금액", "거래금액"),
    "description": ("메모", "내용", "적요", "가맹점", "가맹점명", "이용처"),
    "account": ("계좌", "계좌/카드"),
    "card": ("카드", "카드명", "결제카드"),
    "payment_method": ("결제수단", "결제 수단"),
    "owner": ("소유자", "사용자"),
}
REQUIRED_COLUMNS = ("date", "type", "amount")


def column_map(header: list[str]) -> dict[str, int] | None:
    """헤더 행이면 {필드: 칸 번호}, 아니면 None. 필수 칸이 빠진 헤더는 InvalidInputError."""
    cells = [re.sub(r"\s+", "", c).lstrip("﻿") for c in header]
    columns: dict[str, int] = {}
    for field_name, aliases in COLUMN_ALIASES.items():
        normalized = {re.sub(r"\s+", "", a) for a in aliases}
        idx = next((i for i, c in enumerate(cells) if c in normalized), None)
        if idx is not None:
            columns[field_name] = idx
    if "date" not in columns:
        return None
    missing = [COLUMN_ALIASES[f][0] for f in REQUIRED_COLUMNS if f not in columns]
    if missing:
        raise InvalidInputError(f"CSV 헤더에 {', '.join(missing)} 칸이 없습니다.")
    return columns


POSITIONAL_COLUMNS = {
    "date": 0, "type": 1, "category": 2, "amount": 3, "description": 4, "account": 6, "payment_method": 7, "owner": 8,
    "card": 9,
}
