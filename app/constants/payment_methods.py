"""거래 결제수단 — `Transaction.payment_method`(자유텍스트 String(50) 컬럼)에 저장하는 값의 정본.
입력 스키마는 `PaymentMethod`로 엄격히 받고, 출력은 미지 값을 "other"로 폴백한다(`app/schemas/transaction.py`).
값을 추가하면 CSV 라벨(`PAYMENT_METHOD_LABELS`)과 프론트 `constants/transactions.ts`도 함께 고친다
(손 타입 드리프트는 `apiDrift.check.ts`가 잡는다)."""

from typing import Literal, get_args

PaymentMethod = Literal["cash", "credit_card", "debit_card", "transfer", "other"]
PAYMENT_METHODS: tuple[str, ...] = get_args(PaymentMethod)

# CSV 내보내기·가져오기의 한국어 라벨
PAYMENT_METHOD_LABELS: dict[str, str] = {
    "cash": "현금",
    "credit_card": "신용카드",
    "debit_card": "체크카드",
    "transfer": "계좌이체",
    "other": "기타",
}

# 결제카드 종류(`Card.card_type`) → 그 카드로 결제한 거래의 payment_method
PAYMENT_METHOD_BY_CARD_TYPE: dict[str, str] = {"credit": "credit_card", "debit": "debit_card"}
