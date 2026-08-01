import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import CategoryPicker from "@/components/common/CategoryPicker";
import FormInput from "@/components/common/FormInput";
import { INLINE_BUTTON_OFFSET, INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { formatKrwPreview } from "@/utils/format";
import type { CategoryOut, AccountWithBalanceOut, TransactionCreateIn, TransactionType } from "@/types";

export interface TransactionFormValues {
  amount: string;
  type: TransactionType;
  category_id: string;
  transaction_date: string;
  description: string;
  payment_method: string;
  account_id: string;
}

interface Props {
  categories: CategoryOut[];
  accounts: AccountWithBalanceOut[];
  initialValues?: Partial<TransactionFormValues>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (payload: TransactionCreateIn) => void;
  layout?: "row" | "stack";
}

const today = () => new Date().toISOString().slice(0, 10);

export default function TransactionForm({
  categories,
  accounts,
  initialValues,
  submitLabel,
  submitting,
  onSubmit,
  layout = "row",
}: Props) {
  const [values, setValues] = useState<TransactionFormValues>({
    amount: initialValues?.amount ?? "",
    type: initialValues?.type ?? "expense",
    category_id:
      initialValues?.category_id ??
      String(categories.find((c) => c.kind === (initialValues?.type ?? "expense"))?.id ?? ""),
    transaction_date: initialValues?.transaction_date ?? today(),
    description: initialValues?.description ?? "",
    payment_method: initialValues?.payment_method ?? "",
    account_id: initialValues?.account_id ?? "",
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      amount: values.amount,
      type: values.type,
      category_id: Number(values.category_id),
      transaction_date: values.transaction_date,
      description: values.description || null,
      payment_method: values.payment_method || null,
      account_id: values.account_id ? Number(values.account_id) : null,
    });
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
            onClick={() =>
              setValues((v) => ({
                ...v,
                type: t,
                category_id: String(categories.find((c) => c.kind === t)?.id ?? ""),
              }))
            }
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              values.type === t
                ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-50"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {t === "expense" ? "지출" : "수입"}
          </button>
        ))}
      </div>

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

      <CategoryPicker
        categories={categories}
        kind={values.type}
        value={values.category_id}
        onChange={(category_id) => setValues((v) => ({ ...v, category_id }))}
        required
      />

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

      <Button type="submit" loading={submitting} className={buttonOffset}>
        {submitLabel}
      </Button>
    </form>
  );
}
