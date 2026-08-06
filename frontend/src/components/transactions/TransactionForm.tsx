import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import CategoryPicker from "@/components/common/CategoryPicker";
import FormInput from "@/components/common/FormInput";
import { fetchRecentTransactions } from "@/api/transactions";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { INLINE_BUTTON_OFFSET, INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_COMPACT_MOBILE_ONLY } from "@/constants/uiSizes";
import { EXPENSE_TYPE_FILTER_OPTIONS } from "@/components/transactions/TransactionFilterSheet";
import { categoryTypeBadgeStyle } from "@/utils/colors";
import { formatKrw, formatKrwPreview, toAmountInputValue } from "@/utils/format";
import type {
  CategoryOut,
  AccountWithBalanceOut,
  SavingsProductOut,
  TransactionCreateIn,
  TransactionOut,
  TransactionType,
} from "@/types";

const EXPENSE_TYPE_GROUPS = EXPENSE_TYPE_FILTER_OPTIONS.filter(
  (o): o is { value: "fixed" | "variable" | "irregular"; label: string } => o.value !== "all",
);

export interface TransactionFormValues {
  amount: string;
  type: TransactionType;
  category_id: string;
  transaction_date: string;
  description: string;
  payment_method: string;
  account_id: string;
  savings_product_id: string;
}

interface Props {
  categories: CategoryOut[];
  accounts: AccountWithBalanceOut[];
  savingsProducts: SavingsProductOut[];
  initialValues?: Partial<TransactionFormValues>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (payload: TransactionCreateIn) => void;
  layout?: "row" | "stack";
  /** 새 거래 등록 컨텍스트에서만 "자주 쓰는 항목" 불러오기를 노출한다 (수정 폼에서는 숨김). */
  isNew: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

type UiType = "income" | "expense" | "savings";

export default function TransactionForm({
  categories,
  accounts,
  savingsProducts,
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
  });

  const recentType: TransactionType = uiType === "income" ? "income" : "expense";
  const recentIsSavings = uiType === "savings";
  const recentLimit = uiType === "expense" ? 12 : 8;
  const { data: recentItems } = useQuery({
    queryKey: QUERY_KEYS.recentTransactions({ type: recentType, is_savings: recentIsSavings, limit: recentLimit }),
    queryFn: () => fetchRecentTransactions({ type: recentType, is_savings: recentIsSavings, limit: recentLimit }),
    staleTime: STALE_TIME.SHORT,
    enabled: isNew,
  });

  const recentGroups =
    uiType === "expense"
      ? EXPENSE_TYPE_GROUPS.map((group) => ({
          ...group,
          items: (recentItems ?? []).filter((tx) => tx.category.type === group.value),
        })).filter((group) => group.items.length > 0)
      : [];

  const buildPayload = (v: TransactionFormValues, forSavings: boolean): TransactionCreateIn => ({
    amount: v.amount,
    type: v.type,
    category_id: Number(v.category_id),
    transaction_date: v.transaction_date,
    description: v.description || null,
    payment_method: v.payment_method || null,
    account_id: v.account_id ? Number(v.account_id) : null,
    savings_product_id: forSavings && v.savings_product_id ? Number(v.savings_product_id) : null,
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

  const containerClass = layout === "stack" ? "flex flex-col gap-3 max-w-sm" : "flex flex-wrap items-start gap-3";
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

      {isNew && recentItems && recentItems.length > 0 && (
        <div className="w-full">
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>자주 쓰는 항목</label>
          {recentGroups.length > 0 ? (
            <div className="flex flex-col gap-2">
              {recentGroups.map((group) => (
                <div key={group.value}>
                  <span
                    className={`inline-block mb-1 px-2 py-0.5 rounded text-[11px] font-medium ${categoryTypeBadgeStyle(group.value)}`}
                  >
                    {group.label}
                  </span>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {group.items.map((tx) => (
                      <button
                        key={tx.id}
                        type="button"
                        disabled={submitting}
                        onClick={() => quickAdd(tx)}
                        className={`shrink-0 px-3 rounded-full border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${TOUCH_TARGET_COMPACT_MOBILE_ONLY}`}
                      >
                        {tx.category.name} · {formatKrw(tx.amount)}
                        {tx.description ? ` · ${tx.description}` : ""}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recentItems.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => quickAdd(tx)}
                  className={`shrink-0 px-3 rounded-full border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${TOUCH_TARGET_COMPACT_MOBILE_ONLY}`}
                >
                  {tx.category.name} · {formatKrw(tx.amount)}
                  {tx.description ? ` · ${tx.description}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <FormInput
        label="금액"
        type="number"
        inputMode="decimal"
        value={values.amount}
        onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
        required
        className="w-32"
        preview={Number(values.amount) > 0 ? formatKrwPreview(Number(values.amount)) : undefined}
      />

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

      <FormInput
        label="메모"
        type="text"
        value={values.description}
        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        className="w-40"
      />

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

      {uiType === "savings" && (
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>저축상품</label>
          <select
            className={`${INPUT_SM} w-32`}
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

      <Button type="submit" loading={submitting} className={buttonOffset}>
        {submitLabel}
      </Button>
    </form>
  );
}
