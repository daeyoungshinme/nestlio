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
    layout (날짜,구분,카테고리,금액,메모,입력자). Shared core for import_csv (CSV 파일)
    and the Google Sheets import paths (google_sheets_service가 이미 셀 단위로 분리해서 준다).
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


def import_from_sheet_url(db: Session, sheet_url: str, user_id: uuid.UUID) -> dict:
    """공개 링크(링크가 있는 모든 사용자로 공유된 시트)의 CSV 내보내기를 읽어 가져온다."""
    from app.services import google_sheets_service

    csv_text = google_sheets_service.read_public_csv(sheet_url)
    rows = list(csv.reader(io.StringIO(csv_text)))
    return import_rows(db, rows, user_id)


def import_from_spreadsheet(
    db: Session, spreadsheet_id: str, sheet_name: str | None, user_id: uuid.UUID
) -> dict:
    """구글 계정 연동(OAuth)으로 비공개 시트를 Sheets API로 읽어 가져온다."""
    from app.services import google_auth, google_sheets_service

    if not google_auth.is_connected():
        raise google_auth.GoogleNotConnectedError(
            "구글 계정이 연동되어 있지 않습니다. scripts/google_auth_setup.py를 먼저 실행하세요."
        )
    rows = google_sheets_service.read_values(spreadsheet_id, sheet_name)
    return import_rows(db, rows, user_id)
