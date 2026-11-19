"""CSV 가져오기의 카테고리 추론 — 과거 거래 메모 이력(`MemoIndex`)과 가맹점 키워드 사전. 카테고리 칸이 비었거나
못 찾은 행에 쓴다(우선순위·기본 카테고리 폴백은 `transaction_import_service._resolve_category`)."""

from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.constants.merchant_keywords import EXPENSE_MERCHANT_KEYWORDS
from app.models.category import Category
from app.models.transaction import Transaction
from app.services import transaction_import_parsing as parsing

# (거래 구분, 정규화 메모) → {카테고리 id: [건수, 가장 최근 거래일]}
MemoStats = dict[tuple[str, str], dict[int, list]]


@dataclass
class MemoIndex:
    """메모별 카테고리 사용 이력. 부분 일치 조회(`partial_matches`)가 학습 메모를 다 훑지 않도록 구분별 학습 메모
    최대 길이를 함께 둔다."""

    stats: MemoStats = field(default_factory=dict)
    max_len: dict[str, int] = field(default_factory=dict)

    def learn(self, tx_type: str, memo: str | None, category_id: int, count: int, last_date: date) -> None:
        key = parsing.normalize_memo(memo)
        if not key:
            return
        stats = self.stats.setdefault((tx_type, key), {}).setdefault(category_id, [0, last_date])
        stats[0] += count
        stats[1] = max(stats[1], last_date)
        self.max_len[tx_type] = max(self.max_len.get(tx_type, 0), len(key))

    def exact(self, tx_type: str, key: str) -> dict[int, list]:
        return self.stats.get((tx_type, key), {})

    def partial_matches(self, tx_type: str, key: str) -> Iterator[tuple[int, dict[int, list]]]:
        """key에 들어 있는 2자 이상 학습 메모의 (길이, 이력) — key의 부분 문자열을 긴 것부터 사전에서 찾는다.
        같은 길이 안에서는 key 앞쪽 위치 순."""
        seen: set[str] = set()
        for length in range(min(self.max_len.get(tx_type, 0), len(key)), parsing.MEMO_PARTIAL_MATCH_MIN_LENGTH - 1, -1):
            for start in range(len(key) - length + 1):
                known = key[start : start + length]
                if known in seen:
                    continue
                seen.add(known)
                if (stats := self.stats.get((tx_type, known))) is not None:
                    yield length, stats


def build_memo_index(db: Session) -> MemoIndex:
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
    index = MemoIndex()
    for description, tx_type, category_id, count, last_date in rows:
        index.learn(tx_type, description, category_id, count, last_date)
    return index


def keyword_category(memo: str | None, categories_by_name: dict[str, Category]) -> Category | None:
    """메모에 든 가장 긴 가맹점 키워드의 기본 카테고리(지출만). 그 이름의 활성 지출 카테고리가 없으면 건너뛴다."""
    key = parsing.normalize_memo(memo)
    best: tuple[int, Category] | None = None
    for name, keywords in EXPENSE_MERCHANT_KEYWORDS.items():
        category = categories_by_name.get(name)
        if category is None or not category.is_active or category.kind != "expense":
            continue
        for keyword in keywords:
            if keyword in key and (best is None or len(keyword) > best[0]):
                best = (len(keyword), category)
    return best[1] if best else None


def infer_category(
    index: MemoIndex, tx_type: str, memo: str | None, categories_by_id: dict[int, Category]
) -> Category | None:
    """메모가 같은(없으면 학습된 메모를 포함하는 가장 긴 — 같은 길이면 이력 건수가 많은) 과거 거래에서 가장 많이
    쓴 카테고리. 동률이면 최근 거래 쪽. 비활성이거나 구분(수입/지출)이 다른 카테고리는 후보에서 뺀다."""
    key = parsing.normalize_memo(memo)
    if not key:
        return None

    def eligible(stats: dict[int, list]) -> dict[int, list]:
        return {
            cid: s
            for cid, s in stats.items()
            if (c := categories_by_id.get(cid)) is not None and c.is_active and c.kind == tx_type
        }

    candidates = eligible(index.exact(tx_type, key))
    if not candidates:
        best: tuple[int, int, dict[int, list]] | None = None  # (메모 길이, 이력 건수, 후보)
        for length, stats in index.partial_matches(tx_type, key):
            if best is not None and length < best[0]:
                break  # 긴 것부터 나오므로 더 짧은 메모는 볼 필요가 없다
            if (found := eligible(stats)) and (best is None or sum(s[0] for s in stats.values()) > best[1]):
                best = (length, sum(s[0] for s in stats.values()), found)
        if best is None:
            return None
        candidates = best[2]
    best_id = max(candidates, key=lambda cid: (candidates[cid][0], candidates[cid][1]))
    return categories_by_id[best_id]
