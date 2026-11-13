import { useState } from "react";
import { useRecentQuickItems } from "@/components/transactions/TransactionQuickPicks";
import type { UiType } from "@/components/transactions/TransactionQuickPicks";
import { NON_CARD_PAYMENT_METHODS } from "@/constants/transactions";
import { useCards } from "@/hooks/useReferenceData";
import { currentDateIso } from "@/utils/date";
import { toAmountInputValue } from "@/utils/format";
import type {
  CardOut,
  CashflowPlanItemOut,
  CategoryOut,
  PaymentMethod,
  TransactionCreateIn,
  TransactionOut,
  TransactionType,
} from "@/types";

export interface TransactionFormValues {
  amount: string;
  type: TransactionType;
  category_id: string;
  transaction_date: string;
  description: string;
  payment_method: PaymentMethod | "";
  account_id: string;
  savings_product_id: string;
  owner_user_id: string;
  /** 결제카드 — 고르면 계좌는 카드의 결제계좌로 잠긴다(서버도 카드 기준으로 덮어쓴다). */
  card_id: string;
}

export const CARD_PREFIX = "card:";
export const METHOD_PREFIX = "method:";

function buildPayload(v: TransactionFormValues, forSavings: boolean): TransactionCreateIn {
  return {
    amount: v.amount,
    type: v.type,
    category_id: Number(v.category_id),
    transaction_date: v.transaction_date,
    description: v.description || null,
    payment_method: v.payment_method || null,
    account_id: v.account_id ? Number(v.account_id) : null,
    savings_product_id: forSavings && v.savings_product_id ? Number(v.savings_product_id) : null,
    card_id: v.card_id ? Number(v.card_id) : null,
    owner_user_id: v.owner_user_id || null,
  };
}

/** 거래 입력 폼의 상태와 동작 — 유형(지출/수입/저축·투자) 전환, 결제(카드 또는 결제수단) ↔ 계좌 연동, 자주 쓰는 항목
 * 즉시 등록, 계획 항목 프리필, 제출 검증. 화면 배치는 TransactionForm이 한다. */
export function useTransactionForm({
  categories,
  initialValues,
  isNew,
  currentUserId,
  editingCard,
  onSubmit,
}: {
  categories: CategoryOut[];
  initialValues?: Partial<TransactionFormValues>;
  isNew: boolean;
  currentUserId?: string;
  editingCard?: CardOut | null;
  onSubmit: (payload: TransactionCreateIn) => void;
}) {
  const { data: cardRows, isError: cardsError } = useCards();
  const activeCards = (cardRows ?? []).map((row) => row.card);
  const cardOptions =
    editingCard && !activeCards.some((c) => c.id === editingCard.id) ? [...activeCards, editingCard] : activeCards;
  const savingsCategory = categories.find((c) => c.is_savings);
  const nonSavingsCategories = categories.filter((c) => !c.is_savings);

  const initialCategory = categories.find((c) => String(c.id) === (initialValues?.category_id ?? ""));
  const [uiType, setUiType] = useState<UiType>(
    initialCategory?.is_savings ? "savings" : (initialValues?.type ?? "expense"),
  );

  const [values, setValues] = useState<TransactionFormValues>({
    amount: initialValues?.amount ? toAmountInputValue(initialValues.amount) : "",
    type: initialValues?.type ?? "expense",
    // 신규 입력은 일부러 비워 둔다 — 첫 카테고리를 미리 골라 두면 바꾸지 않고 저장해 오분류된다.
    category_id: initialValues?.category_id ?? "",
    transaction_date: initialValues?.transaction_date ?? currentDateIso(),
    description: initialValues?.description ?? "",
    payment_method: initialValues?.payment_method ?? "",
    account_id: initialValues?.account_id ?? "",
    savings_product_id: initialValues?.savings_product_id ?? "",
    owner_user_id: initialValues?.owner_user_id ?? (isNew ? (currentUserId ?? "") : ""),
    card_id: initialValues?.card_id ?? "",
  });
  const setField = <K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const [showCategoryError, setShowCategoryError] = useState(false);
  const { data: recentItems } = useRecentQuickItems(uiType, isNew && uiType !== "savings");
  const recentCategoryIds = (recentItems ?? []).map((tx) => tx.category.id);
  const kindCategories = nonSavingsCategories.filter((c) => c.kind === values.type);

  /** 유형 전환 — 카테고리·저축상품·결제는 유형마다 다르므로 비운다. 저축/투자는 지출 + 저축 카테고리. */
  const switchType = (next: UiType) => {
    setUiType(next);
    setValues((v) => ({
      ...v,
      type: next === "savings" ? "expense" : next,
      category_id: next === "savings" && savingsCategory ? String(savingsCategory.id) : "",
      savings_product_id: "",
      card_id: "",
      payment_method: "",
    }));
  };

  const handleSubmit = () => {
    if (uiType !== "savings" && !values.category_id) {
      setShowCategoryError(true);
      return;
    }
    onSubmit(buildPayload(values, uiType === "savings"));
  };

  /** "자주 쓰는 항목" 칩 탭 = 현재 선택된 날짜로 즉시 등록 (탭 1회 = 등록 완료). */
  const quickAdd = (tx: TransactionOut) => {
    onSubmit(
      buildPayload(
        {
          ...values,
          amount: toAmountInputValue(tx.amount),
          type: tx.type,
          category_id: String(tx.category.id),
          description: tx.description ?? "",
          payment_method: tx.payment_method ?? "",
          account_id: tx.account ? String(tx.account.id) : "",
          savings_product_id: tx.savings_product_id ? String(tx.savings_product_id) : "",
          // 그 사이 비활성화된 카드면 빼고 넣는다(새 거래엔 활성 카드만 지정할 수 있다)
          card_id: tx.card_id && activeCards.some((c) => c.id === tx.card_id) ? String(tx.card_id) : "",
        },
        Boolean(tx.savings_product_id),
      ),
    );
  };

  /** "이번 달 계획" 칩 탭 = 폼만 프리필(금액/카테고리/메모/소유자), 즉시 등록하지 않는다.
   * 계획 금액과 실제 지출액이 다를 수 있고, 카테고리 미지정(자유 텍스트) 계획 항목도 있어 자동 등록은 위험하다. */
  const applyPlanItem = (item: CashflowPlanItemOut) => {
    setValues((v) => ({
      ...v,
      amount: toAmountInputValue(item.amount),
      category_id: item.category_id ? String(item.category_id) : v.category_id,
      description: item.name,
      owner_user_id: uiType === "income" ? (item.owner_user_id ?? "") : v.owner_user_id,
    }));
  };

  /** "결제" 선택 = 카드(card:id) 또는 카드가 아닌 결제수단(method:값). 카드를 고르면 계좌를 결제계좌로 맞춘다. */
  const paymentValue = values.card_id
    ? `${CARD_PREFIX}${values.card_id}`
    : values.payment_method
      ? `${METHOD_PREFIX}${values.payment_method}`
      : "";
  // 카드 없이 신용/체크로 기록된 예전 거래는 그 값을 선택지에 남긴다
  const methodOptions =
    values.payment_method && !values.card_id && !NON_CARD_PAYMENT_METHODS.includes(values.payment_method)
      ? [...NON_CARD_PAYMENT_METHODS, values.payment_method]
      : NON_CARD_PAYMENT_METHODS;
  const selectedCard = values.card_id ? cardOptions.find((c) => String(c.id) === values.card_id) : undefined;

  const changePayment = (raw: string) => {
    if (raw.startsWith(CARD_PREFIX)) {
      const cardId = raw.slice(CARD_PREFIX.length);
      const card = cardOptions.find((c) => String(c.id) === cardId);
      // 원래 카드로 되돌리면 저장된 계좌로(서버도 카드가 그대로면 저장된 계좌를 유지한다)
      const accountId =
        cardId === (initialValues?.card_id ?? "")
          ? (initialValues?.account_id ?? "")
          : card?.payment_account_id
            ? String(card.payment_account_id)
            : "";
      setValues((v) => ({ ...v, card_id: cardId, account_id: accountId }));
      return;
    }
    const method = raw.startsWith(METHOD_PREFIX) ? (raw.slice(METHOD_PREFIX.length) as PaymentMethod) : "";
    setValues((v) => ({ ...v, card_id: "", payment_method: method }));
  };

  return {
    values,
    setField,
    uiType,
    switchType,
    savingsCategory,
    nonSavingsCategories,
    kindCategories,
    recentCategoryIds,
    showCategoryError,
    handleSubmit,
    quickAdd,
    applyPlanItem,
    payment: { value: paymentValue, cardOptions, methodOptions, selectedCard, cardsError, change: changePayment },
  };
}
