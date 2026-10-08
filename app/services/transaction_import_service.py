import csv
import io
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.transaction import Transaction

CSV_HEADER = ["날짜", "구분", "카테고리", "금액", "메모", "입력자"]
CSV_TYPE_LABELS = {"income": "수입", "expense": "지출"}
CSV_TYPE_BY_LABEL = {"수입": "income", "지출": "expense", "income": "income", "expense": "expense"}


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
            ]
        )
    return buffer.getvalue()


def import_rows(db: Session, rows: list[list[str]], user_id: uuid.UUID) -> dict:
    """Bulk-create transactions from already-split rows matching export_csv's column
    layout (날짜,구분,카테고리,금액,메모,입력자). import_csv가 파싱한 행을 넘긴다.
    Unknown categories or malformed rows are skipped and reported, not raised,
    so one bad row doesn't abort an otherwise-good import."""
    categories_by_name = {c.name: c for c in db.query(Category).all()}
    if rows and rows[0] and rows[0][0].strip() in ("날짜", CSV_HEADER[0]):
        rows = rows[1:]  # skip header if present

    created = 0
    skipped: list[dict] = []
    created_transactions: list[Transaction] = []
    for line_no, row in enumerate(rows, start=1):
        if not row or not any(cell.strip() for cell in row):
            continue
        try:
            # 각 행을 SAVEPOINT로 감싼다 — db.flush()가 IntegrityError/DataError(금액 정밀도 초과,
            # 메모 길이 초과 등)를 내면 세션이 오염돼 이후 행과 최종 commit이 모두 실패하므로,
            # 행 단위로 롤백해 나머지 가져오기를 계속 진행한다.
            with db.begin_nested():
                raw_date, raw_type, raw_category, raw_amount, *rest = row
                description = rest[0] if rest else ""
                tx_type = CSV_TYPE_BY_LABEL.get(raw_type.strip())
                category = categories_by_name.get(raw_category.strip())
                if tx_type is None or category is None:
                    raise ValueError("unknown type or category")
                tx = Transaction(
                    user_id=user_id,
                    category_id=category.id,
                    type=tx_type,
                    amount=Decimal(raw_amount.strip()),
                    transaction_date=date.fromisoformat(raw_date.strip()),
                    description=description.strip() or None,
                )
                db.add(tx)
                db.flush()  # PK 확보 (되돌리기용 created_ids, 최종 commit은 루프 종료 후 한 번)
            created_transactions.append(tx)
            created += 1
        except (ValueError, InvalidOperation, IndexError, SQLAlchemyError) as exc:
            skipped.append({"line": line_no, "row": row, "reason": str(exc)})
    db.commit()
    return {"created": created, "skipped": skipped, "created_ids": [tx.id for tx in created_transactions]}


def import_csv(db: Session, content: str, user_id: uuid.UUID) -> dict:
    rows = list(csv.reader(io.StringIO(content)))
    return import_rows(db, rows, user_id)

