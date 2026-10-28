import csv
import io
import re
import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Literal

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.constants.merchant_keywords import EXPENSE_MERCHANT_KEYWORDS
from app.errors import InvalidInputError, PayloadTooLargeError
from app.models.account import Account
from app.models.card import Card
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.services import card_service, user_service

CSV_HEADER = ["날짜", "구분", "카테고리", "금액", "메모", "입력자", "계좌", "결제수단", "소유자", "카드"]
PAYMENT_METHOD_LABELS = {"cash": "현금", "credit_card": "신용카드", "debit_card": "체크카드", "transfer": "계좌이체", "other": "기타"}
CSV_TYPE_LABELS = {"income": "수입", "expense": "지출"}
CSV_TYPE_BY_LABEL = {"수입": "income", "지출": "expense", "income": "income", "expense": "expense"}
# 부분 일치로 쓸 학습 메모의 최소 길이 — 한 글자("커")는 거의 모든 메모에 들어가 엉뚱하게 매칭된다.
MEMO_PARTIAL_MATCH_MIN_LENGTH = 2

# (거래 구분, 정규화 메모) → {카테고리 id: [건수, 가장 최근 거래일]}
MemoIndex = dict[tuple[str, str], dict[int, list]]
DUPLICATE_REASON = "이미 같은 날 같은 금액의 비슷한 거래가 있어 건너뛰었습니다"
# 자동으로 정한 카테고리의 출처: 과거 거래 이력 / 가맹점 키워드 사전 / 업로드 시 고른 기본 카테고리
CategorySource = Literal["history", "keyword", "fallback"]
# 은행·카드 앱 CSV의 날짜: 2026-10-26, 2026.10.26, 2026/10/26, 2026. 10. 26., 20261026 — 뒤에 시각이 붙어도 된다.
_DATE_RE = re.compile(r"(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?(?:\s.*)?|(\d{4})(\d{2})(\d{2})")


def _parse_date(raw: str) -> date:
    m = _DATE_RE.fullmatch(raw.strip())
    if m is None:
        raise ValueError(f"날짜 형식을 읽을 수 없습니다: '{raw.strip()}' (예: 2026-10-26, 2026.10.26)")
    y, mo, d = (int(g) for g in (m.groups()[:3] if m.group(1) else m.groups()[3:]))
    try:
        return date(y, mo, d)
    except ValueError:
        raise ValueError(f"없는 날짜입니다: '{raw.strip()}'") from None


def _parse_amount(raw: str) -> Decimal:
    """천 단위 쉼표·'원'·공백을 허용한다(12,000원)."""
    cleaned = re.sub(r"[,\s원₩]", "", raw)
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        raise ValueError(f"금액을 읽을 수 없습니다: '{raw.strip()}'") from None


def _normalize_memo(memo: str | None) -> str:
    return re.sub(r"\s+", " ", (memo or "").strip()).casefold()


def _similar_memo(a: str, b: str) -> bool:
    """정규화한 두 메모가 같거나, 짧은 쪽(2자 이상)이 긴 쪽에 들어 있으면 비슷하다.
    빈 메모는 무엇과도 비슷하지 않다 — 메모 없는 별개 지출이 합쳐지거나 중복으로 빠지지 않게."""
    if not a or not b:
        return False
    short, long_ = sorted((a, b), key=len)
    return short == long_ or (len(short) >= MEMO_PARTIAL_MATCH_MIN_LENGTH and short in long_)


@dataclass
class _ImportLine:
    """CSV 한 줄을 해석한 값. memo는 정규화된 메모."""

    line_no: int
    row: list[str]
    amount: Decimal
    memo: str
    account: Account | None
    payment_method: str | None
    owner: User | None
    card: Card | None = None


@dataclass
class _ImportGroup:
    """같은 날·구분·카테고리에 메모가 비슷한 CSV 행 묶음 — 거래 한 건이 된다.
    계좌·결제수단·소유자는 병합 기준에 넣지 않는다 — 넣으면 처음 합쳐 가져온 줄들에 나중에 서로 다른 계좌를
    채워 다시 올렸을 때 묶음이 갈라져 금액이 기존 거래와 어긋나고, 기존 거래를 못 찾아 중복 생성된다.
    묶음 안에서 값이 다르면 처음 나온 비어 있지 않은 값을 쓴다."""

    transaction_date: date
    tx_type: str
    category: Category
    description: str | None
    lines: list[_ImportLine] = field(default_factory=list)
    inferred: list[tuple[int, str, CategorySource]] = field(default_factory=list)  # (행 번호, 메모, 출처)

    @property
    def amount(self) -> Decimal:
        return sum((line.amount for line in self.lines), Decimal("0"))

    @property
    def memos(self) -> list[str]:
        return [line.memo for line in self.lines]

    def matches(self, tx_date: date, tx_type: str, category: Category, memo: str) -> bool:
        return (
            (self.transaction_date, self.tx_type, self.category.id) == (tx_date, tx_type, category.id)
            and any(_similar_memo(memo, m) for m in self.memos)
        )


def _first_filled(lines: list[_ImportLine], attr: str):
    return next((v for line in lines if (v := getattr(line, attr)) is not None), None)


def _take_existing(same_day: list[Transaction], amount: Decimal, memos: list[str]) -> Transaction | None:
    """같은 날·구분 기존 거래 중 금액이 같고 메모가 비슷한 첫 거래를 꺼낸다(한 건은 한 번만 매칭)."""
    tx = next(
        (
            t
            for t in same_day
            if t.amount == amount and any(_similar_memo(_normalize_memo(t.description), m) for m in memos)
        ),
        None,
    )
    if tx is not None:
        same_day.remove(tx)
    return tx


def _backfill(tx: Transaction, lines: list[_ImportLine]) -> bool:
    """기존 거래의 비어 있는 카드·계좌·결제수단·소유자만 CSV 값으로 채운다. 이미 있는 값은 건드리지 않는다
    (소유자 None은 '공통'과 구분되지 않아, CSV가 사람을 지정했을 때만 채운다). 바뀐 게 있으면 True."""
    changed = False
    card = _first_filled(lines, "card")
    if tx.card_id is None and card is not None:
        tx.card_id = card.id
        changed = True
    account = _first_filled(lines, "account")
    if tx.account_id is None and account is not None:
        tx.account_id = account.id
        changed = True
    payment_method = _first_filled(lines, "payment_method")
    if tx.payment_method is None and payment_method is not None:
        tx.payment_method = payment_method
        changed = True
    owner = _first_filled(lines, "owner")
    if tx.owner_user_id is None and owner is not None:
        tx.owner_user_id = owner.id
        changed = True
    return changed


# 결제수단 칸 → payment_method. 앞에서부터 먼저 걸리는 규칙("체크카드"는 "카드"보다 먼저).
# 영문 값(cash 등)은 그대로 받는다. 어느 것에도 안 걸리는 비어 있지 않은 값은 "other".
_PAYMENT_METHOD_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("체크", "직불", "debit"), "debit_card"),
    (("신용", "카드", "credit"), "credit_card"),
    (("현금", "cash"), "cash"),
    (("이체", "송금", "계좌", "transfer"), "transfer"),
)


def _parse_payment_method(raw: str) -> str | None:
    key = _normalize_memo(raw)
    if not key:
        return None
    if key in ("cash", "credit_card", "debit_card", "transfer", "other"):
        return key
    return next((method for words, method in _PAYMENT_METHOD_RULES if any(w in key for w in words)), "other")


# 결제수단 칸에서 카드 이름을 찾지 않을 일반 표기 — "신용카드"가 "신한카드" 같은 카드 이름과 부분 일치하지 않게
_GENERIC_PAYMENT_LABELS = {
    _normalize_memo(label) for label in (*PAYMENT_METHOD_LABELS, *PAYMENT_METHOD_LABELS.values(), "카드", "신용", "체크")
}


def _match_by_name[T: (Account, Card)](raw: str, items: list[T]) -> T | None:
    """계좌·카드 칸 → 활성 계좌·카드. 이름이 정규화 후 같으면 그것, 아니면 서로 포함하는(2자 이상) 것 중 이름이
    가장 긴 것("신한카드" ↔ "신한카드(본인)")."""
    key = _normalize_memo(raw)
    if not key:
        return None
    names = [(_normalize_memo(a.name), a) for a in items if a.is_active]
    exact = next((a for name, a in names if name == key), None)
    if exact is not None:
        return exact
    partial = [(len(name), a) for name, a in names if _similar_memo(name, key)]
    return max(partial, key=lambda p: p[0])[1] if partial else None


def _resolve_card(raw_card: str, raw_account: str, raw_payment: str, cards: list[Card]) -> Card | None:
    """카드 칸 → (계좌로 못 찾은) 계좌 칸 → 결제수단 칸 순으로 카드를 찾는다. 카드 칸이 채워져 있으면 그것만 본다."""
    if raw_card:
        return _match_by_name(raw_card, cards)
    if (card := _match_by_name(raw_account, cards)) is not None:
        return card
    if _normalize_memo(raw_payment) in _GENERIC_PAYMENT_LABELS:
        return None
    return _match_by_name(raw_payment, cards)


# 소유자 칸의 공통 표기 — 화면(common/OwnerSelect)에서 소유자 없음(None)을 "공통"으로 보여준다.
COMMON_OWNER_LABEL = "공통"
_COMMON_OWNER_ALIASES = {"공통", "공동", "함께"}


def _match_owner(raw: str, users: list[User]) -> User | None:
    """소유자 칸 → 가구 사용자(표시 이름, 없으면 이메일 정규화 일치). 공통 표기는 호출부가 먼저 거른다."""
    key = _normalize_memo(raw)
    return next((u for u in users if _normalize_memo(u.display_name) == key), None) or next(
        (u for u in users if _normalize_memo(u.email) == key), None
    )


# 헤더가 있으면 이름으로 칸을 찾는다(순서가 달라도 됨). 없으면 CSV_HEADER 순서로 읽는다.
_COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
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
_REQUIRED_COLUMNS = ("date", "type", "amount")


def _column_map(header: list[str]) -> dict[str, int] | None:
    """헤더 행이면 {필드: 칸 번호}, 아니면 None. 필수 칸이 빠진 헤더는 InvalidInputError."""
    cells = [re.sub(r"\s+", "", c).lstrip("﻿") for c in header]
    columns: dict[str, int] = {}
    for field_name, aliases in _COLUMN_ALIASES.items():
        normalized = {re.sub(r"\s+", "", a) for a in aliases}
        idx = next((i for i, c in enumerate(cells) if c in normalized), None)
        if idx is not None:
            columns[field_name] = idx
    if "date" not in columns:
        return None
    missing = [_COLUMN_ALIASES[f][0] for f in _REQUIRED_COLUMNS if f not in columns]
    if missing:
        raise InvalidInputError(f"CSV 헤더에 {', '.join(missing)} 칸이 없습니다.")
    return columns


_POSITIONAL_COLUMNS = {
    "date": 0, "type": 1, "category": 2, "amount": 3, "description": 4, "account": 6, "payment_method": 7, "owner": 8,
    "card": 9,
}


def _learn_memo(index: MemoIndex, tx_type: str, memo: str | None, category_id: int, count: int, last_date: date) -> None:
    key = _normalize_memo(memo)
    if not key:
        return
    stats = index.setdefault((tx_type, key), {}).setdefault(category_id, [0, last_date])
    stats[0] += count
    stats[1] = max(stats[1], last_date)


def _build_memo_index(db: Session) -> MemoIndex:
    """저장된 거래의 메모별 카테고리 사용 이력. 정규화는 파이썬에서 하므로 원문 메모 단위로 한 번에 집계한다."""
    rows = (
        db.query(
            Transaction.description,
            Transaction.type,
            Transaction.category_id,
            func.count(Transaction.id),
            func.max(Transaction.transaction_date),
        )
        .filter(Transaction.description.isnot(None))
        .group_by(Transaction.description, Transaction.type, Transaction.category_id)
        .all()
    )
    index: MemoIndex = {}
    for description, tx_type, category_id, count, last_date in rows:
        _learn_memo(index, tx_type, description, category_id, count, last_date)
    return index


def _keyword_category(memo: str | None, categories_by_name: dict[str, Category]) -> Category | None:
    """메모에 든 가장 긴 가맹점 키워드의 기본 카테고리(지출만). 그 이름의 활성 지출 카테고리가 없으면 건너뛴다."""
    key = _normalize_memo(memo)
    best: tuple[int, Category] | None = None
    for name, keywords in EXPENSE_MERCHANT_KEYWORDS.items():
        category = categories_by_name.get(name)
        if category is None or not category.is_active or category.kind != "expense":
            continue
        for keyword in keywords:
            if keyword in key and (best is None or len(keyword) > best[0]):
                best = (len(keyword), category)
    return best[1] if best else None


def _infer_category(
    index: MemoIndex, tx_type: str, memo: str | None, categories_by_id: dict[int, Category]
) -> Category | None:
    """메모가 같은(없으면 학습된 메모를 포함하는 가장 긴) 과거 거래에서 가장 많이 쓴 카테고리.
    동률이면 최근 거래 쪽. 비활성이거나 구분(수입/지출)이 다른 카테고리는 후보에서 뺀다."""
    key = _normalize_memo(memo)
    if not key:
        return None

    def eligible(stats: dict[int, list]) -> dict[int, list]:
        return {
            cid: s
            for cid, s in stats.items()
            if (c := categories_by_id.get(cid)) is not None and c.is_active and c.kind == tx_type
        }

    candidates = eligible(index.get((tx_type, key), {}))
    if not candidates:
        partial = [
            (len(known), sum(s[0] for s in stats.values()), stats)
            for (t, known), stats in index.items()
            if t == tx_type and len(known) >= MEMO_PARTIAL_MATCH_MIN_LENGTH and known in key and eligible(stats)
        ]
        if not partial:
            return None
        candidates = eligible(max(partial, key=lambda p: (p[0], p[1]))[2])
    best_id = max(candidates, key=lambda cid: (candidates[cid][0], candidates[cid][1]))
    return categories_by_id[best_id]


def decode_upload(raw: bytes) -> str:
    """업로드된 CSV 바이트를 텍스트로. 호출부는 상한+1바이트까지만 읽어 넘긴다(통째로 read()하면 거대한 업로드
    하나가 Render 무료 인스턴스 메모리를 다 쓴다). 엑셀이 저장하는 CP949도 받는다."""
    if len(raw) > settings.max_upload_bytes:
        raise PayloadTooLargeError(f"CSV 파일은 {settings.max_upload_size_mb}MB를 넘을 수 없습니다.")
    for encoding in ("utf-8-sig", "cp949"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise InvalidInputError("CSV 파일 인코딩을 읽을 수 없습니다. UTF-8 또는 CP949로 저장해 주세요.")


def export_csv(transactions: list[Transaction]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_HEADER)
    for tx in transactions:
        writer.writerow(
            [
                tx.transaction_date.isoformat(),
                CSV_TYPE_LABELS.get(tx.type, tx.type),
                tx.category.name,
                str(tx.amount),
                tx.description or "",
                tx.user.display_name,
                tx.account.name if tx.account else "",
                PAYMENT_METHOD_LABELS.get(tx.payment_method or "", tx.payment_method or ""),
                tx.owner.display_name if tx.owner else COMMON_OWNER_LABEL,
                tx.card.name if tx.card else "",
            ]
        )
    return buffer.getvalue()


def import_rows(
    db: Session, rows: list[list[str]], user_id: uuid.UUID, fallback_category_id: int | None = None
) -> dict:
    """Bulk-create transactions from already-split rows. import_csv가 파싱한 행을 넘긴다.
    헤더 행이 있으면 칸을 이름으로 찾고(`_column_map`, 순서 무관), 없으면 export_csv 순서
    (날짜,구분,카테고리,금액,메모,입력자,계좌,결제수단,소유자,카드)로 읽는다. 입력자 칸은 쓰지 않는다(입력자 = 가져온 사람).
    Unknown categories or malformed rows are skipped and reported, not raised,
    so one bad row doesn't abort an otherwise-good import.

    계좌·카드 칸은 활성 계좌·카드 이름으로(`_match_by_name`), 소유자 칸은 가구 사용자 표시 이름·이메일로(`_match_owner`,
    "공통"은 소유자 없음) 매칭하고, 못 찾은 이름은 비워 넣고 `unmatched_accounts`/`unmatched_owners`로 알린다.
    결제수단 칸은 한국어 라벨·별칭을 받는다(`_parse_payment_method`). 카드는 카드 칸 → 계좌 칸(카드가 계좌 종류이던
    시절의 내보내기) → 결제수단 칸(일반 표기 제외) 순으로 찾고(`_resolve_card`), 찾으면 결제수단은 카드 종류, 계좌는
    계좌 칸에 적힌 계좌(없으면 카드의 결제계좌)로 정한다 — 화면 입력(카드 우선)과 달리 적힌 계좌가 실제 나간 계좌다.

    카테고리 칸이 비었거나 모르는 이름이면 메모로 과거 거래 이력(`_infer_category`) → 가맹점 키워드 사전
    (`_keyword_category`, 지출만) → `fallback_category_id`(같은 구분일 때만) 순으로 정하고 `auto_categorized`에
    출처(`source`)와 함께 알린다. 명시된 카테고리는 덮어쓰지 않는다. 앞 행의 명시 카테고리도 뒤 행의 학습에 쓴다.

    같은 날·구분·카테고리에 메모가 비슷한(`_similar_memo`) 행은 금액을 합쳐 한 건으로 만들고(`merged`),
    합친 결과가 이미 저장된 거래(같은 날·구분·금액, 비슷한 메모)와 겹치면 새로 만들지 않고 그 거래의 비어 있는
    계좌·결제수단·소유자만 채운다(`_backfill`, `updated`). 채울 게 없으면 중복으로 건너뛴다 — 같은 CSV를 다시
    올려도 두 번 들어가지 않고, 칸을 채운 CSV를 다시 올리면 기존 거래가 채워진다. 묶음으로 못 찾았지만 줄마다
    서로 다른 기존 거래가 있으면(합치지 않고 들어간 예전 데이터) 줄 단위로 같은 처리를 한다."""
    categories = db.query(Category).all()
    categories_by_name = {c.name: c for c in categories}
    categories_by_id = {c.id: c for c in categories}
    fallback = categories_by_id.get(fallback_category_id) if fallback_category_id is not None else None
    if fallback_category_id is not None and (fallback is None or not fallback.is_active):
        raise InvalidInputError("기본 카테고리를 찾을 수 없습니다.")
    memo_index = _build_memo_index(db)
    accounts = db.query(Account).all()
    cards = card_service.list_cards(db)
    users = user_service.list_users(db)
    columns = _column_map(rows[0]) if rows else None
    if columns is not None:
        rows = rows[1:]
    else:
        columns = _POSITIONAL_COLUMNS

    def cell(row: list[str], field_name: str) -> str:
        idx = columns.get(field_name)
        return row[idx].strip() if idx is not None and idx < len(row) else ""

    skipped: list[dict] = []
    unmatched_accounts: list[str] = []
    unmatched_owners: list[str] = []
    unmatched_cards: list[str] = []

    # 1) 행 해석 + 파일 안 병합
    groups: list[_ImportGroup] = []
    for line_no, row in enumerate(rows, start=1):
        if not row or not any(cell.strip() for cell in row):
            continue
        try:
            raw_type, raw_category = cell(row, "type"), cell(row, "category")
            description = cell(row, "description")
            tx_date = _parse_date(cell(row, "date"))
            amount = _parse_amount(cell(row, "amount"))
            tx_type = CSV_TYPE_BY_LABEL.get(raw_type)
            if tx_type is None:
                raise ValueError(f"구분은 수입/지출이어야 합니다: '{raw_type}'")
            category = categories_by_name.get(raw_category)
            source: CategorySource | None = None
            if category is None:
                if (category := _infer_category(memo_index, tx_type, description, categories_by_id)) is not None:
                    source = "history"
                elif tx_type == "expense" and (category := _keyword_category(description, categories_by_name)):
                    source = "keyword"
                elif fallback is not None and fallback.kind == tx_type:
                    category, source = fallback, "fallback"
                else:
                    unknown = f"카테고리 '{raw_category}'를 찾을 수 없고" if raw_category else "카테고리가 비어 있고"
                    raise ValueError(f"{unknown} 메모로도 추론하지 못했습니다")
        except (ValueError, InvalidOperation, IndexError) as exc:
            skipped.append({"line": line_no, "row": row, "reason": str(exc)})
            continue
        if source is None:
            _learn_memo(memo_index, tx_type, description, category.id, 1, tx_date)
        raw_account, raw_card, raw_payment = cell(row, "account"), cell(row, "card"), cell(row, "payment_method")
        account = _match_by_name(raw_account, accounts)
        card = _resolve_card(raw_card, raw_account if account is None else "", raw_payment, cards)
        if raw_card and card is None and raw_card not in unmatched_cards:
            unmatched_cards.append(raw_card)
        if raw_account and account is None and card is None and raw_account not in unmatched_accounts:
            unmatched_accounts.append(raw_account)
        payment_method = _parse_payment_method(raw_payment)
        if card is not None:
            # 계좌 칸에 적힌 계좌가 있으면 그것을 쓴다 — 그 거래가 실제로 나간 계좌라, 그 뒤 카드의 결제계좌를
            # 바꿨어도 내보내기 → 다시 가져오기에서 지난 거래가 새 계좌로 옮겨지면 안 된다. 화면 입력은 새 거래라
            # 카드 우선(transaction_service._apply_card)이지만 CSV는 기존 기록의 이관이다.
            account = account or card.payment_account
            payment_method = card_service.PAYMENT_METHOD_BY_CARD_TYPE[card.card_type]
        raw_owner = cell(row, "owner")
        owner = None
        if raw_owner and raw_owner not in _COMMON_OWNER_ALIASES:
            owner = _match_owner(raw_owner, users)
            if owner is None and raw_owner not in unmatched_owners:
                unmatched_owners.append(raw_owner)
        line = _ImportLine(line_no, row, amount, _normalize_memo(description), account, payment_method, owner, card)
        group = next((g for g in groups if g.matches(tx_date, tx_type, category, line.memo)), None)
        if group is None:
            group = _ImportGroup(tx_date, tx_type, category, description or None)
            groups.append(group)
        group.lines.append(line)
        if source is not None:
            group.inferred.append((line_no, description, source))

    # 2) 이미 저장된 거래 — 날짜 집합으로 한 번만 조회한다
    existing: dict[tuple[date, str], list[Transaction]] = {}
    dates = {g.transaction_date for g in groups}
    if dates:
        for tx in db.query(Transaction).filter(Transaction.transaction_date.in_(dates)):
            existing.setdefault((tx.transaction_date, tx.type), []).append(tx)

    # 3) 묶음마다: 기존 거래가 있으면 빈 칸 채우기/건너뛰기, 없으면 새로 생성
    created_transactions: list[Transaction] = []
    updated_ids: list[int] = []
    auto_categorized: list[dict] = []
    merged: list[dict] = []
    for group in groups:
        same_day = existing.get((group.transaction_date, group.tx_type), [])
        matched: list[tuple[list[_ImportLine], Transaction]] = []
        if (tx := _take_existing(same_day, group.amount, group.memos)) is not None:
            matched = [(group.lines, tx)]
        elif len(group.lines) > 1:
            per_line = [(line, _take_existing(same_day, line.amount, [line.memo])) for line in group.lines]
            if all(tx is not None for _, tx in per_line):
                matched = [([line], tx) for line, tx in per_line]
            else:
                same_day.extend(tx for _, tx in per_line if tx is not None)  # 일부만 맞으면 되돌리고 새로 생성
        if matched:
            for lines, tx in matched:
                if _backfill(tx, lines):
                    updated_ids.append(tx.id)
                else:
                    skipped.extend({"line": ln.line_no, "row": ln.row, "reason": DUPLICATE_REASON} for ln in lines)
            continue
        try:
            # 묶음마다 SAVEPOINT로 감싼다 — db.flush()가 IntegrityError/DataError(금액 정밀도 초과,
            # 메모 길이 초과 등)를 내면 세션이 오염돼 이후 행과 최종 commit이 모두 실패하므로,
            # 묶음 단위로 롤백해 나머지 가져오기를 계속 진행한다.
            with db.begin_nested():
                tx = Transaction(
                    user_id=user_id,
                    category_id=group.category.id,
                    type=group.tx_type,
                    amount=group.amount,
                    transaction_date=group.transaction_date,
                    description=group.description,
                    account_id=account.id if (account := _first_filled(group.lines, "account")) else None,
                    payment_method=_first_filled(group.lines, "payment_method"),
                    owner_user_id=owner.id if (owner := _first_filled(group.lines, "owner")) else None,
                    card_id=card.id if (card := _first_filled(group.lines, "card")) else None,
                )
                db.add(tx)
                db.flush()  # PK 확보 (되돌리기용 created_ids, 최종 commit은 루프 종료 후 한 번)
        except SQLAlchemyError as exc:
            skipped.extend({"line": ln.line_no, "row": ln.row, "reason": str(exc)} for ln in group.lines)
            continue
        created_transactions.append(tx)
        auto_categorized.extend(
            {"line": line_no, "description": description, "category_name": group.category.name, "source": source}
            for line_no, description, source in group.inferred
        )
        if len(group.lines) > 1:
            merged.append(
                {"lines": [ln.line_no for ln in group.lines], "description": group.description or "", "amount": group.amount}
            )
    db.commit()
    skipped.sort(key=lambda s: s["line"])
    return {
        "created": len(created_transactions),
        "updated": len(updated_ids),
        "skipped": skipped,
        "created_ids": [tx.id for tx in created_transactions],
        "unmatched_accounts": unmatched_accounts,
        "unmatched_owners": unmatched_owners,
        "unmatched_cards": unmatched_cards,
        "auto_categorized": auto_categorized,
        "merged": merged,
    }


def import_csv(db: Session, content: str, user_id: uuid.UUID, fallback_category_id: int | None = None) -> dict:
    rows = list(csv.reader(io.StringIO(content)))
    return import_rows(db, rows, user_id, fallback_category_id)

