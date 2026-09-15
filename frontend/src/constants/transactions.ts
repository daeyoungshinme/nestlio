import type { PaymentMethod } from "@/types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "현금",
  credit_card: "신용카드",
  debit_card: "체크카드",
  transfer: "계좌이체",
  other: "기타",
};

export const PAYMENT_METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({
  value: value as PaymentMethod,
  label,
}));
