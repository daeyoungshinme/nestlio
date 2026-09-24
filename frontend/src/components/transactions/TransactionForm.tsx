import { useState } from "react";
import type { FormEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Button from "@/components/common/Button";
import CategoryPicker from "@/components/common/CategoryPicker";
import FormInput from "@/components/common/FormInput";
import OwnerSelect from "@/components/common/OwnerSelect";
import TransactionQuickPicks from "@/components/transactions/TransactionQuickPicks";
import type { UiType } from "@/components/transactions/TransactionQuickPicks";
import { INLINE_BUTTON_OFFSET, INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { PAYMENT_METHOD_OPTIONS } from "@/constants/transactions";
import { currentDateIso } from "@/utils/date";
import { amountInputPreview, toAmountInputValue } from "@/utils/format";
import type {
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
}

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
}: Props) {
  const savingsCategory = categories.find((c) => c.is_savings);
  const nonSavingsCategories = categories.filter((c) => !c.is_savings);

  const initialCategory = categories.find((c) => String(c.id) === (initialValues?.category_id ?? ""));
  const [uiType, setUiType] = useState<UiType>(
    initialCategory?.is_savings ? "savings" : (initialValues?.type ?? "expense"),
  );

  const [values, setValues] = useState<TransactionFormValues>({
    amount: initialValues?.amount ? toAmountInputValue(initialValues.amount) : "",
    type: initialValues?.type ?? "expense",
    category_id:
      initialValues?.category_id ??
      String(nonSavingsCategories.find((c) => c.kind === (initialValues?.type ?? "expense"))?.id ?? ""),
    transaction_date: initialValues?.transaction_date ?? today(),
    description: initialValues?.description ?? "",
    payment_method: initialValues?.payment_method ?? "",
    account_id: initialValues?.account_id ?? "",
    savings_product_id: initialValues?.savings_product_id ?? "",
    owner_user_id: initialValues?.owner_user_id ?? (isNew ? (currentUserId ?? "") : ""),
  });

  /** 계좌·소유자 등 부가 필드 접기/펼치기. 이미 값이 있는 상태(수정 모드 포함)로 시작하면 숨겨져 놀라지 않도록 펼친 채로 시작한다. */
  const [showDetails, setShowDetails] = useState(
    () => !isNew || Boolean(initialValues?.account_id || initialValues?.owner_user_id),
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
    owner_user_id: v.owner_user_id || null,
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
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

  const isStack = layout === "stack";
  const containerClass = isStack ? "flex flex-col gap-3 max-w-sm" : "flex flex-wrap items-start gap-3";
  const buttonOffset = layout === "row" ? INLINE_BUTTON_OFFSET : "";

  return (
    <form onSubmit={handleSubmit} className={containerClass}>
      <div className={`flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ${buttonOffset}`}>
        {(["expense", "income"] as TransactionType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setUiType(t);
              setValues((v) => ({
                ...v,
                type: t,
                category_id: String(nonSavingsCategories.find((c) => c.kind === t)?.id ?? ""),
                savings_product_id: "",
              }));
            }}
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
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
              }));
            }}
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
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

      <FormInput
        label="금액"
        type="number"
        inputMode="decimal"
        value={values.amount}
        onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
        required
        className={isStack ? "w-full" : "w-32"}
        inputSize={isStack ? "md" : "sm"}
        preview={amountInputPreview(values.amount)}
      />

      {isStack ? (
        <div className={`grid gap-3 w-full ${uiType === "savings" ? "grid-cols-1" : "grid-cols-2"}`}>
          {uiType !== "savings" && (
            <CategoryPicker
              categories={nonSavingsCategories}
              kind={values.type}
              value={values.category_id}
              onChange={(category_id) => setValues((v) => ({ ...v, category_id }))}
              required
              className="w-full"
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
        </div>
      ) : (
        <>
          {uiType !== "savings" && (
            <CategoryPicker
              categories={nonSavingsCategories}
              kind={values.type}
              value={values.category_id}
              onChange={(category_id) => setValues((v) => ({ ...v, category_id }))}
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
        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        className={isStack ? "w-full" : "w-40"}
      />

      {isStack ? (
        <div className="w-full">
          <button
            type="button"
            onClick={() => setShowDetails((s) => !s)}
            className={`flex items-center gap-1 ${LABEL_SM} font-medium py-1`}
          >
            상세 입력 (계좌 · 소유자)
            {showDetails ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </button>
          {showDetails && (
            <div className={`grid gap-3 mt-1 ${users.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <label className={`block mb-1 font-medium ${LABEL_SM}`}>계좌</label>
                <select
                  className={`${INPUT_SM} w-full`}
                  value={values.account_id}
                  onChange={(e) => setValues((v) => ({ ...v, account_id: e.target.value }))}
                >
                  <option value="">(선택 안 함)</option>
                  {accounts.map(({ account }) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              {uiType === "expense" && (
                <div>
                  <label className={`block mb-1 font-medium ${LABEL_SM}`}>결제수단</label>
                  <select
                    className={`${INPUT_SM} w-full`}
                    value={values.payment_method}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, payment_method: e.target.value as PaymentMethod | "" }))
                    }
                  >
                    <option value="">(선택 안 함)</option>
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
          <div>
            <label className={`block mb-1 font-medium ${LABEL_SM}`}>계좌</label>
            <select
              className={`${INPUT_SM} w-32`}
              value={values.account_id}
              onChange={(e) => setValues((v) => ({ ...v, account_id: e.target.value }))}
            >
              <option value="">(선택 안 함)</option>
              {accounts.map(({ account }) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {uiType === "expense" && (
            <div>
              <label className={`block mb-1 font-medium ${LABEL_SM}`}>결제수단</label>
              <select
                className={`${INPUT_SM} w-32`}
                value={values.payment_method}
                onChange={(e) => setValues((v) => ({ ...v, payment_method: e.target.value as PaymentMethod | "" }))}
              >
                <option value="">(선택 안 함)</option>
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

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
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>저축상품</label>
          <select
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

      <Button type="submit" loading={submitting} className={isStack ? "w-full" : buttonOffset}>
        {submitLabel}
      </Button>
    </form>
  );
}
