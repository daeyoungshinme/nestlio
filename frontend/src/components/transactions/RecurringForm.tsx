import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import CategoryPicker from "@/components/common/CategoryPicker";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { formatKrwPreview, toAmountInputValue } from "@/utils/format";
import type { CategoryOut, RecurringFrequency, RecurringOut } from "@/types";

export interface RecurringFormValues {
  name: string;
  category_id: string;
  amount: string;
  frequency: RecurringFrequency;
  start_date: string;
  end_date: string;
  reminder_days_before: string;
}

const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};

interface Props {
  categories: CategoryOut[];
  initial?: RecurringOut;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: RecurringFormValues) => void;
}

export default function RecurringForm({ categories, initial, submitLabel, submitting, onSubmit }: Props) {
  const [values, setValues] = useState<RecurringFormValues>({
    name: initial?.name ?? "",
    category_id: initial ? String(initial.category_id) : "",
    amount: toAmountInputValue(initial?.amount),
    frequency: initial?.frequency ?? "monthly",
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
    reminder_days_before: String(initial?.reminder_days_before ?? 3),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!values.name.trim() || !values.category_id || !values.start_date) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <FormInput
        label="항목명"
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        required
      />
      <CategoryPicker
        categories={categories}
        kind="expense"
        value={values.category_id}
        onChange={(categoryId) => setValues((v) => ({ ...v, category_id: categoryId }))}
        placeholder="카테고리 선택"
        className="w-full"
        required
      />
      <FormInput
        label="금액"
        type="number"
        inputMode="decimal"
        value={values.amount}
        onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
        required
        preview={Number(values.amount) > 0 ? formatKrwPreview(Number(values.amount)) : undefined}
      />
      <div>
        <label className={`block mb-1 font-medium ${LABEL_SM}`}>주기</label>
        <select
          className={`${INPUT_SM} w-full`}
          value={values.frequency}
          onChange={(e) => setValues((v) => ({ ...v, frequency: e.target.value as RecurringFrequency }))}
        >
          {(Object.keys(FREQUENCY_LABEL) as RecurringFrequency[]).map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormInput
          label="시작일"
          type="date"
          value={values.start_date}
          onChange={(e) => setValues((v) => ({ ...v, start_date: e.target.value }))}
          required
        />
        <FormInput
          label="종료일 (선택)"
          type="date"
          value={values.end_date}
          onChange={(e) => setValues((v) => ({ ...v, end_date: e.target.value }))}
        />
      </div>
      <FormInput
        label="리마인더 (일 전)"
        type="number"
        min={0}
        value={values.reminder_days_before}
        onChange={(e) => setValues((v) => ({ ...v, reminder_days_before: e.target.value }))}
      />
      <Button type="submit" loading={submitting} className="w-full justify-center">
        {submitLabel}
      </Button>
    </form>
  );
}
