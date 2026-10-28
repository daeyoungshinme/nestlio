import { useId, useState } from "react";
import type { FormEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import AmountInput from "@/components/common/AmountInput";
import Button from "@/components/common/Button";
import CategoryChipPicker from "@/components/common/CategoryChipPicker";
import CategoryPicker from "@/components/common/CategoryPicker";
import FormInput from "@/components/common/FormInput";
import OwnerSelect from "@/components/common/OwnerSelect";
import TransactionQuickPicks, { useRecentQuickItems } from "@/components/transactions/TransactionQuickPicks";
import type { UiType } from "@/components/transactions/TransactionQuickPicks";
import { INLINE_BUTTON_OFFSET, INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { CARD_TYPE_LABEL, NON_CARD_PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/constants/transactions";
import { useCards } from "@/hooks/useReferenceData";
import { currentDateIso } from "@/utils/date";
import { toAmountInputValue } from "@/utils/format";
import type {
  CardOut,
  CategoryOut,
  AccountWithBalanceOut,
  CashflowPlanItemOut,
  PaymentMethod,
  SavingsProductOut,
  TransactionCreateIn,
  TransactionOut,
  TransactionType,
  UserOut,
} from "@/types";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";

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

interface Props {
  categories: CategoryOut[];
  accounts: AccountWithBalanceOut[];
  savingsProducts: SavingsProductOut[];
  users: UserOut[];
  /** 신규 등록 시 "소유자" 기본값으로 프리필할 로그인 사용자 id. */
  currentUserId?: string;
  initialValues?: Partial<TransactionFormValues>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (payload: TransactionCreateIn) => void;
  layout?: "row" | "stack";
  /** 새 거래 등록 컨텍스트에서만 "자주 쓰는 항목" 불러오기를 노출한다 (수정 폼에서는 숨김). */
  isNew: boolean;
  /** 수정 폼에서만 — 목록 행에 삭제 버튼을 두지 않고 여기로 모았다(확인 모달은 부모가 띄운다). */
  onDelete?: () => void;
  /** 수정 중인 거래의 카드 — 비활성화된 카드여도 선택지에 남겨 그대로 저장할 수 있게. */
  editingCard?: CardOut | null;
}

const CARD_PREFIX = "card:";
const METHOD_PREFIX = "method:";

const today = currentDateIso;


export default function TransactionForm({
  categories,
  accounts,
  savingsProducts,
  users,
  currentUserId,
  initialValues,
  submitLabel,
  submitting,
  onSubmit,
  layout = "row",
  isNew,
  onDelete,
  editingCard,
}: Props) {
  const fieldId = useId();
  const { data: cardRows } = useCards();
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
    transaction_date: initialValues?.transaction_date ?? today(),
    description: initialValues?.description ?? "",
    payment_method: initialValues?.payment_method ?? "",
    account_id: initialValues?.account_id ?? "",
    savings_product_id: initialValues?.savings_product_id ?? "",
    owner_user_id: initialValues?.owner_user_id ?? (isNew ? (currentUserId ?? "") : ""),
    card_id: initialValues?.card_id ?? "",
  });

  const [showCategoryError, setShowCategoryError] = useState(false);
  const { data: recentItems } = useRecentQuickItems(uiType, isNew && uiType !== "savings");
  const recentCategoryIds = (recentItems ?? []).map((tx) => tx.category.id);
  const kindCategories = nonSavingsCategories.filter((c) => c.kind === values.type);

  /** 계좌·소유자 등 부가 필드 접기/펼치기. 이미 값이 있는 상태(수정 모드 포함)로 시작하면 숨겨져 놀라지 않도록 펼친 채로 시작한다. */
  const [showDetails, setShowDetails] = useState(
    () => !isNew || Boolean(initialValues?.account_id || initialValues?.owner_user_id || initialValues?.card_id),
  );
  const buildPayload = (v: TransactionFormValues, forSavings: boolean): TransactionCreateIn => ({
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
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
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

  const handlePaymentChange = (raw: string) => {
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

  const renderAccountSelect = (id: string, selectClassName: string) => (
    <div>
      <label htmlFor={id} className={`block mb-1 font-medium ${LABEL_SM}`}>계좌</label>
      <select
        id={id}
        className={`${INPUT_SM} ${selectClassName}`}
        value={values.account_id}
        disabled={Boolean(selectedCard)}
        title={selectedCard ? "카드의 결제계좌로 연결돼요" : undefined}
        onChange={(e) => setValues((v) => ({ ...v, account_id: e.target.value }))}
      >
        <option value="">{selectedCard ? "(결제계좌 미지정)" : "(선택 안 함)"}</option>
        {accounts.map(({ account }) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </div>
  );

  const renderPaymentSelect = (id: string, selectClassName: string) => (
    <div>
      <label htmlFor={id} className={`block mb-1 font-medium ${LABEL_SM}`}>결제</label>
      <select
        id={id}
        className={`${INPUT_SM} ${selectClassName}`}
        value={paymentValue}
        onChange={(e) => handlePaymentChange(e.target.value)}
      >
        <option value="">(선택 안 함)</option>
        {cardOptions.length > 0 && (
          <optgroup label="카드">
            {cardOptions.map((card) => (
              <option key={card.id} value={`${CARD_PREFIX}${card.id}`}>
                {card.name} ({CARD_TYPE_LABEL[card.card_type]})
              </option>
            ))}
          </optgroup>
        )}
        {methodOptions.map((method) => (
          <option key={method} value={`${METHOD_PREFIX}${method}`}>
            {PAYMENT_METHOD_LABEL[method]}
          </option>
        ))}
      </select>
    </div>
  );

  const isStack = layout === "stack";
  const containerClass = isStack ? "flex flex-col gap-3 max-w-sm" : "flex flex-wrap items-start gap-3";
  const buttonOffset = layout === "row" ? INLINE_BUTTON_OFFSET : "";

  return (
    <form onSubmit={handleSubmit} className={containerClass}>
      {/* 유형 토글은 폼의 첫 결정이라 모바일에서 폭 전체·44px 높이로 누르기 쉽게 한다. */}
      <div className={`flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ${isStack ? "w-full" : ""} ${buttonOffset}`}>
        {(["expense", "income"] as TransactionType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setUiType(t);
              setValues((v) => ({
                ...v,
                type: t,
                category_id: "",
                savings_product_id: "",
                card_id: "",
              }));
            }}
            className={`flex-1 px-3 ${TOUCH_TARGET_MIN_HEIGHT} text-sm font-medium rounded-md transition-colors ${
              uiType === t
                ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-50"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {t === "expense" ? "지출" : "수입"}
          </button>
        ))}
        {savingsCategory && (
          <button
            type="button"
            onClick={() => {
              setUiType("savings");
              setValues((v) => ({
                ...v,
                type: "expense",
                category_id: String(savingsCategory.id),
                savings_product_id: "",
                card_id: "",
              }));
            }}
            className={`flex-1 px-3 ${TOUCH_TARGET_MIN_HEIGHT} text-sm font-medium rounded-md transition-colors ${
              uiType === "savings"
                ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-50"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            저축/투자
          </button>
        )}
      </div>

      {isNew && (
        <TransactionQuickPicks
          uiType={uiType}
          transactionDate={values.transaction_date}
          users={users}
          submitting={submitting}
          onQuickAdd={quickAdd}
          onApplyPlanItem={applyPlanItem}
        />
      )}

      <AmountInput
        label="금액"
        value={values.amount}
        onChange={(amount) => setValues((v) => ({ ...v, amount }))}
        required
        className={isStack ? "w-full" : "w-32"}
        inputSize={isStack ? "md" : "sm"}
      />

      {isStack ? (
        <>
          {uiType !== "savings" && (
            <CategoryChipPicker
              categories={kindCategories}
              value={values.category_id}
              onChange={(category_id) => setValues((v) => ({ ...v, category_id }))}
              recentCategoryIds={recentCategoryIds}
              showRequiredError={showCategoryError}
            />
          )}
          <FormInput
            label="날짜"
            type="date"
            value={values.transaction_date}
            onChange={(e) => setValues((v) => ({ ...v, transaction_date: e.target.value }))}
            required
            className="w-full"
          />
        </>
      ) : (
        <>
          {uiType !== "savings" && (
            <CategoryPicker
              categories={nonSavingsCategories}
              kind={values.type}
              value={values.category_id}
              onChange={(category_id) => setValues((v) => ({ ...v, category_id }))}
              placeholder="선택"
              required
            />
          )}
          <FormInput
            label="날짜"
            type="date"
            value={values.transaction_date}
            onChange={(e) => setValues((v) => ({ ...v, transaction_date: e.target.value }))}
            required
            className="w-40"
          />
        </>
      )}

      <FormInput
        label="메모"
        type="text"
        value={values.description}
        maxLength={255}
        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        className={isStack ? "w-full" : "w-40"}
      />

      {isStack ? (
        <div className="w-full">
          <button
            type="button"
            onClick={() => setShowDetails((s) => !s)}
            aria-expanded={showDetails}
            className={`flex items-center gap-1 ${LABEL_SM} font-medium ${TOUCH_TARGET_MIN_HEIGHT}`}
          >
            상세 입력 (결제 · 계좌 · 소유자)
            {showDetails ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
          {showDetails && (
            <div className="grid gap-3 mt-1 grid-cols-2">
              {uiType === "expense" && renderPaymentSelect(`${fieldId}-1`, "w-full")}
              {renderAccountSelect(`${fieldId}-0`, "w-full")}

              {users.length > 1 && (
                <OwnerSelect
                  value={values.owner_user_id}
                  onChange={(owner) => setValues((v) => ({ ...v, owner_user_id: owner }))}
                  users={users}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {uiType === "expense" && renderPaymentSelect(`${fieldId}-3`, "w-32")}
          {renderAccountSelect(`${fieldId}-2`, "w-32")}

          {users.length > 1 && (
            <OwnerSelect
              value={values.owner_user_id}
              onChange={(owner) => setValues((v) => ({ ...v, owner_user_id: owner }))}
              users={users}
              selectClassName="w-32"
            />
          )}
        </>
      )}

      {uiType === "savings" && (
        <div>
          <label htmlFor={`${fieldId}-4`} className={`block mb-1 font-medium ${LABEL_SM}`}>저축상품</label>
          <select
            id={`${fieldId}-4`}
            className={`${INPUT_SM} ${isStack ? "w-full" : "w-32"}`}
            value={values.savings_product_id}
            onChange={(e) => setValues((v) => ({ ...v, savings_product_id: e.target.value }))}
            required
          >
            <option value="">선택</option>
            {savingsProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {isStack ? (
        // 모바일 키보드가 열리면 폼이 시트 높이를 넘겨 맨 아래 버튼이 화면 밖으로 밀린다.
        // 시트의 스크롤 영역 바닥에 붙여 두어 키보드를 닫거나 스크롤하지 않고도 바로 누를 수 있게 한다.
        <div className="sticky bottom-0 w-full -mb-3 pt-3 pb-3 bg-white dark:bg-gray-900 flex gap-2">
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete} disabled={submitting}>
              삭제
            </Button>
          )}
          <Button type="submit" loading={submitting} className="flex-1 justify-center">
            {submitLabel}
          </Button>
        </div>
      ) : (
        <Button type="submit" loading={submitting} className={buttonOffset}>
          {submitLabel}
        </Button>
      )}
    </form>
  );
}
