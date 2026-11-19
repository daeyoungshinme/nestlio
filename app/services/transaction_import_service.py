import csv
import io
import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Literal

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.constants.payment_methods import PAYMENT_METHOD_BY_CARD_TYPE, PAYMENT_METHOD_LABELS
from app.errors import InvalidInputError, PayloadTooLargeError
from app.models.account import Account
from app.models.card import Card
from app.models.category import Category
from app.models.transaction import Transaction
from app.models.user import User
from app.services import card_service, user_service
from app.services import transaction_import_inference as inference
from app.services import transaction_import_parsing as parsing

logger = logging.getLogger(__name__)

CSV_HEADER = ["날짜", "구분", "카테고리", "금액", "메모", "입력자", "계좌", "결제수단", "소유자", "카드"]
CSV_TYPE_LABELS = {"income": "수입", "expense": "지출"}
CSV_TYPE_BY_LABEL = {"수입": "income", "지출": "expense", "income": "income", "expense": "expense"}
DUPLICATE_REASON = "이미 같은 날 같은 금액의 비슷한 거래가 있어 건너뛰었습니다"
SAVE_FAILED_REASON = "저장하지 못했습니다. 메모 길이와 금액을 확인해 주세요"
# 행 수 상한. 파일 크기 상한(max_upload_size_mb)만으로는 짧은 행 수십만 개가 들어와 요청이 오래 묶인다.
MAX_IMPORT_ROWS = 10_000
# 자동으로 정한 카테고리의 출처: 과거 거래 이력 / 가맹점 키워드 사전 / 업로드 시 고른 기본 카테고리
CategorySource = Literal["history", "keyword", "fallback"]


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

    def has_similar_memo(self, memo: str) -> bool:
        return any(parsing.similar_memo(memo, m) for m in self.memos)


def _first_filled(lines: list[_ImportLine], attr: str):
    return next((v for line in lines if (v := getattr(line, attr)) is not None), None)


def _take_existing(same_day: list[Transaction], amount: Decimal, memos: list[str]) -> Transaction | None:
    """같은 날·구분 기존 거래 중 금액이 같고 메모가 비슷한 첫 거래를 꺼낸다(한 건은 한 번만 매칭)."""
    tx = next(
        (
            t
            for t in same_day
            if t.amount == amount and any(parsing.similar_memo(parsing.normalize_memo(t.description), m) for m in memos)
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
                tx.owner.display_name if tx.owner else parsing.COMMON_OWNER_LABEL,
                tx.card.name if tx.card else "",
            ]
        )
    return buffer.getvalue()


@dataclass
class _ImportContext:
    """가져오기 한 번에 쓰는 조회 결과 — 행마다 다시 조회하지 않게 처음에 한 번만 만든다."""

    # 같은 이름이 수입·지출 양쪽에 있을 수 있어 (구분, 이름)으로 찾는다. 비활성 카테고리는 새 거래에 붙이지 않는다.
    active_categories: dict[tuple[str, str], Category]
    expense_categories_by_name: dict[str, Category]
    categories_by_id: dict[int, Category]
    fallback: Category | None
    memo_index: inference.MemoIndex
    accounts: parsing.NameIndex[Account]
    cards: parsing.NameIndex[Card]
    users: list[User]


def _load_context(db: Session, fallback_category_id: int | None) -> _ImportContext:
    categories = db.query(Category).all()
    active_categories = {(c.kind, c.name): c for c in categories if c.is_active}
    categories_by_id = {c.id: c for c in categories}
    fallback = categories_by_id.get(fallback_category_id) if fallback_category_id is not None else None
    if fallback_category_id is not None and (fallback is None or not fallback.is_active):
        raise InvalidInputError("기본 카테고리를 찾을 수 없습니다.")
    return _ImportContext(
        active_categories=active_categories,
        expense_categories_by_name={name: c for (kind, name), c in active_categories.items() if kind == "expense"},
        categories_by_id=categories_by_id,
        fallback=fallback,
        memo_index=inference.build_memo_index(db),
        accounts=parsing.NameIndex(db.query(Account).all()),
        cards=parsing.NameIndex(card_service.list_cards(db)),
        users=user_service.list_users(db),
    )


def _resolve_category(
    ctx: _ImportContext, tx_type: str, raw_category: str, description: str
) -> tuple[Category, CategorySource | None]:
    """카테고리 칸 → 그 구분의 활성 카테고리(출처 None). 비었거나 못 찾으면 메모 이력 → 가맹점 키워드(지출만) →
    기본 카테고리(같은 구분일 때만). 다 실패하면 ValueError(행 건너뛰기 사유)."""
    if (category := ctx.active_categories.get((tx_type, raw_category))) is not None:
        return category, None
    if (category := inference.infer_category(ctx.memo_index, tx_type, description, ctx.categories_by_id)) is not None:
        return category, "history"
    if tx_type == "expense" and (category := inference.keyword_category(description, ctx.expense_categories_by_name)):
        return category, "keyword"
    if ctx.fallback is not None and ctx.fallback.kind == tx_type:
        return ctx.fallback, "fallback"
    label = CSV_TYPE_LABELS[tx_type]
    unknown = f"{label} 카테고리 '{raw_category}'를 찾을 수 없고" if raw_category else "카테고리가 비어 있고"
    raise ValueError(f"{unknown} 메모로도 추론하지 못했습니다")


@dataclass
class _ParsedRows:
    """1단계 결과: 파일 안에서 병합한 묶음(나온 순서), 건너뛴 행, 못 찾은 이름(나온 순서, 중복 없음)."""

    groups: list[_ImportGroup] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)
    unmatched_accounts: dict[str, None] = field(default_factory=dict)
    unmatched_owners: dict[str, None] = field(default_factory=dict)
    unmatched_cards: dict[str, None] = field(default_factory=dict)
    # (날짜, 구분, 카테고리 id) → 그 키의 묶음들. 메모 비교는 같은 키 안에서만 한다.
    _by_key: dict[tuple[date, str, int], list[_ImportGroup]] = field(default_factory=dict)

    def add(
        self, tx_date: date, tx_type: str, category: Category, description: str, line: _ImportLine,
        source: CategorySource | None,
    ) -> None:
        bucket = self._by_key.setdefault((tx_date, tx_type, category.id), [])
        group = next((g for g in bucket if g.has_similar_memo(line.memo)), None)
        if group is None:
            group = _ImportGroup(tx_date, tx_type, category, description or None)
            bucket.append(group)
            self.groups.append(group)
        group.lines.append(line)
        if source is not None:
            group.inferred.append((line.line_no, description, source))


def _parse_line(
    ctx: _ImportContext, parsed: _ParsedRows, cell: Callable[[str], str], line_no: int, row: list[str],
    amount: Decimal, description: str,
) -> _ImportLine:
    """계좌·카드·결제수단·소유자 칸을 해석한다. 못 찾은 이름은 `parsed`의 unmatched_*에 모은다."""
    raw_account, raw_card, raw_payment = cell("account"), cell("card"), cell("payment_method")
    account = ctx.accounts.match(raw_account)
    card = parsing.resolve_card(raw_card, raw_account if account is None else "", raw_payment, ctx.cards)
    if raw_card and card is None:
        parsed.unmatched_cards.setdefault(raw_card)
    if raw_account and account is None and card is None:
        parsed.unmatched_accounts.setdefault(raw_account)
    payment_method = parsing.parse_payment_method(raw_payment)
    if card is not None:
        # 계좌 칸에 적힌 계좌가 있으면 그것을 쓴다 — 그 거래가 실제로 나간 계좌라, 그 뒤 카드의 결제계좌를
        # 바꿨어도 내보내기 → 다시 가져오기에서 지난 거래가 새 계좌로 옮겨지면 안 된다. 화면 입력은 새 거래라
        # 카드 우선(transaction_service._apply_card)이지만 CSV는 기존 기록의 이관이다.
        account = account or card.payment_account
        payment_method = PAYMENT_METHOD_BY_CARD_TYPE[card.card_type]
    raw_owner = cell("owner")
    owner = None
    if raw_owner and raw_owner not in parsing.COMMON_OWNER_ALIASES:
        owner = parsing.match_owner(raw_owner, ctx.users)
        if owner is None:
            parsed.unmatched_owners.setdefault(raw_owner)
    return _ImportLine(line_no, row, amount, parsing.normalize_memo(description), account, payment_method, owner, card)


def _parse_rows(ctx: _ImportContext, rows: list[list[str]], columns: dict[str, int]) -> _ParsedRows:
    """1단계: 행 해석 + 파일 안 병합. 잘못된 행은 사유와 함께 건너뛴다. 명시된 카테고리는 바로 학습해 뒤 행의
    추론에 쓴다."""
    parsed = _ParsedRows()
    for line_no, row in enumerate(rows, start=1):
        if not row or not any(value.strip() for value in row):
            continue

        def cell(field_name: str, row: list[str] = row) -> str:
            idx = columns.get(field_name)
            return row[idx].strip() if idx is not None and idx < len(row) else ""

        try:
            raw_type, raw_category = cell("type"), cell("category")
            description = cell("description")
            tx_date = parsing.parse_date(cell("date"))
            amount = parsing.parse_amount(cell("amount"))
            tx_type = CSV_TYPE_BY_LABEL.get(raw_type)
            if tx_type is None:
                raise ValueError(f"구분은 수입/지출이어야 합니다: '{raw_type}'")
            category, source = _resolve_category(ctx, tx_type, raw_category, description)
        except (ValueError, InvalidOperation, IndexError) as exc:
            parsed.skipped.append({"line": line_no, "row": row, "reason": str(exc)})
            continue
        if source is None:
            ctx.memo_index.learn(tx_type, description, category.id, 1, tx_date)
        line = _parse_line(ctx, parsed, cell, line_no, row, amount, description)
        parsed.add(tx_date, tx_type, category, description, line, source)
    return parsed


def _existing_by_day(db: Session, groups: list[_ImportGroup]) -> dict[tuple[date, str], list[Transaction]]:
    """2단계: 묶음 날짜의 이미 저장된 거래를 (날짜, 구분)별로 — 날짜 집합으로 한 번만 조회한다."""
    existing: dict[tuple[date, str], list[Transaction]] = {}
    dates = {g.transaction_date for g in groups}
    if dates:
        for tx in db.query(Transaction).filter(Transaction.transaction_date.in_(dates)):
            existing.setdefault((tx.transaction_date, tx.type), []).append(tx)
    return existing


def _match_existing(group: _ImportGroup, same_day: list[Transaction]) -> list[tuple[list[_ImportLine], Transaction]]:
    """묶음 전체와 겹치는 기존 거래, 없으면 줄마다 서로 다른 기존 거래(전부 있을 때만). 매칭된 거래는 `same_day`에서
    빠진다. 일부 줄만 맞으면 되돌리고 빈 목록(새로 생성)."""
    if (tx := _take_existing(same_day, group.amount, group.memos)) is not None:
        return [(group.lines, tx)]
    if len(group.lines) == 1:
        return []
    per_line = [(line, _take_existing(same_day, line.amount, [line.memo])) for line in group.lines]
    if all(tx is not None for _, tx in per_line):
        return [([line], tx) for line, tx in per_line]
    same_day.extend(tx for _, tx in per_line if tx is not None)
    return []


def _skip_lines(skipped: list[dict], lines: list[_ImportLine], reason: str) -> None:
    skipped.extend({"line": ln.line_no, "row": ln.row, "reason": reason} for ln in lines)


def _create_group(db: Session, group: _ImportGroup, user_id: uuid.UUID) -> Transaction | None:
    """묶음 하나를 거래로 저장한다. 저장에 실패하면 None.
    묶음마다 SAVEPOINT로 감싼다 — db.flush()가 IntegrityError/DataError(금액 정밀도 초과, 메모 길이 초과 등)를 내면
    세션이 오염돼 이후 행과 최종 commit이 모두 실패하므로, 묶음 단위로 롤백해 나머지 가져오기를 계속 진행한다."""
    account = _first_filled(group.lines, "account")
    owner = _first_filled(group.lines, "owner")
    card = _first_filled(group.lines, "card")
    try:
        with db.begin_nested():
            tx = Transaction(
                user_id=user_id,
                category_id=group.category.id,
                type=group.tx_type,
                amount=group.amount,
                transaction_date=group.transaction_date,
                description=group.description,
                account_id=account.id if account else None,
                payment_method=_first_filled(group.lines, "payment_method"),
                owner_user_id=owner.id if owner else None,
                card_id=card.id if card else None,
            )
            db.add(tx)
            db.flush()  # PK 확보 (되돌리기용 created_ids, 최종 commit은 가져오기 끝에 한 번)
    except SQLAlchemyError:
        # 예외 문자열에는 SQL 원문이 들어 있어 응답으로 내보내지 않는다.
        logger.exception("CSV 가져오기 저장 실패: lines=%s", [ln.line_no for ln in group.lines])
        return None
    return tx


def import_rows(
    db: Session, rows: list[list[str]], user_id: uuid.UUID, fallback_category_id: int | None = None
) -> dict:
    """Bulk-create transactions from already-split rows. import_csv가 파싱한 행을 넘긴다.
    헤더 행이 있으면 칸을 이름으로 찾고(`parsing.column_map`, 순서 무관), 없으면 export_csv 순서
    (날짜,구분,카테고리,금액,메모,입력자,계좌,결제수단,소유자,카드)로 읽는다. 입력자 칸은 쓰지 않는다(입력자 = 가져온 사람).
    Unknown categories or malformed rows are skipped and reported, not raised,
    so one bad row doesn't abort an otherwise-good import. 금액은 저장 범위 안의 0 이상만 받는다(`parsing.parse_amount`) —
    취소·환불처럼 음수인 행은 건너뛰고 사유로 알린다.

    계좌·카드 칸은 활성 계좌·카드 이름으로(`parsing.NameIndex`), 소유자 칸은 가구 사용자 표시 이름·이메일로(`parsing.match_owner`,
    "공통"은 소유자 없음) 매칭하고, 못 찾은 이름은 비워 넣고 `unmatched_accounts`/`unmatched_owners`로 알린다.
    결제수단 칸은 한국어 라벨·별칭을 받는다(`parsing.parse_payment_method`). 카드는 카드 칸 → 계좌 칸(카드가 계좌 종류이던
    시절의 내보내기) → 결제수단 칸(일반 표기 제외) 순으로 찾고(`parsing.resolve_card`), 찾으면 결제수단은 카드 종류, 계좌는
    계좌 칸에 적힌 계좌(없으면 카드의 결제계좌)로 정한다 — 화면 입력(카드 우선)과 달리 적힌 계좌가 실제 나간 계좌다.

    카테고리 칸은 그 행 구분의 활성 카테고리 이름으로 찾는다. 비었거나 찾지 못하면 메모로 과거 거래 이력(`inference.infer_category`) → 가맹점 키워드 사전
    (`inference.keyword_category`, 지출만) → `fallback_category_id`(같은 구분일 때만) 순으로 정하고 `auto_categorized`에
    출처(`source`)와 함께 알린다. 명시된 카테고리는 덮어쓰지 않는다. 앞 행의 명시 카테고리도 뒤 행의 학습에 쓴다.

    같은 날·구분·카테고리에 메모가 비슷한(`parsing.similar_memo`) 행은 금액을 합쳐 한 건으로 만들고(`merged`),
    합친 결과가 이미 저장된 거래(같은 날·구분·금액, 비슷한 메모)와 겹치면 새로 만들지 않고 그 거래의 비어 있는
    계좌·결제수단·소유자만 채운다(`_backfill`, `updated`). 채울 게 없으면 중복으로 건너뛴다 — 같은 CSV를 다시
    올려도 두 번 들어가지 않고, 칸을 채운 CSV를 다시 올리면 기존 거래가 채워진다. 묶음으로 못 찾았지만 줄마다
    서로 다른 기존 거래가 있으면(합치지 않고 들어간 예전 데이터) 줄 단위로 같은 처리를 한다.

    단계: 1) 행 해석 + 파일 안 병합(`_parse_rows`) 2) 기존 거래 조회(`_existing_by_day`) 3) 묶음마다 기존 거래
    채우기·건너뛰기(`_match_existing`/`_backfill`) 또는 생성(`_create_group`), 마지막에 한 번 commit."""
    ctx = _load_context(db, fallback_category_id)
    columns = parsing.column_map(rows[0]) if rows else None
    if columns is not None:
        rows = rows[1:]
    else:
        columns = parsing.POSITIONAL_COLUMNS
    if sum(1 for row in rows if any(value.strip() for value in row)) > MAX_IMPORT_ROWS:
        raise PayloadTooLargeError(f"한 번에 {MAX_IMPORT_ROWS:,}행까지 가져올 수 있습니다. 파일을 나눠 올려 주세요.")

    parsed = _parse_rows(ctx, rows, columns)
    existing = _existing_by_day(db, parsed.groups)

    skipped = parsed.skipped
    created_transactions: list[Transaction] = []
    updated_ids: list[int] = []
    auto_categorized: list[dict] = []
    merged: list[dict] = []
    for group in parsed.groups:
        matched = _match_existing(group, existing.get((group.transaction_date, group.tx_type), []))
        if matched:
            for lines, tx in matched:
                if _backfill(tx, lines):
                    updated_ids.append(tx.id)
                else:
                    _skip_lines(skipped, lines, DUPLICATE_REASON)
            continue
        if group.amount >= parsing.AMOUNT_LIMIT:
            _skip_lines(
                skipped, group.lines, f"같은 날 비슷한 메모의 행을 합친 금액이 너무 큽니다: {group.amount:,.0f}원"
            )
            continue
        if (tx := _create_group(db, group, user_id)) is None:
            _skip_lines(skipped, group.lines, SAVE_FAILED_REASON)
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
        "unmatched_accounts": list(parsed.unmatched_accounts),
        "unmatched_owners": list(parsed.unmatched_owners),
        "unmatched_cards": list(parsed.unmatched_cards),
        "auto_categorized": auto_categorized,
        "merged": merged,
    }


def import_csv(db: Session, content: str, user_id: uuid.UUID, fallback_category_id: int | None = None) -> dict:
    rows = list(csv.reader(io.StringIO(content)))
    return import_rows(db, rows, user_id, fallback_category_id)

