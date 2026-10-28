import type { CardType, PaymentMethod } from "@/types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "현금",
  credit_card: "신용카드",
  debit_card: "체크카드",
  transfer: "계좌이체",
  other: "기타",
};

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  credit: "신용카드",
  debit: "체크카드",
};

/** 카드를 등록해 쓰면 카드 자체가 결제수단이 되므로, 가계부 "결제" 선택지에는 카드가 아닌 수단만 따로 둔다. */
export const NON_CARD_PAYMENT_METHODS: PaymentMethod[] = ["cash", "transfer", "other"];
