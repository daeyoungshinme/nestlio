import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import CategoryPicker from "@/components/common/CategoryPicker";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_COMPACT_MOBILE_ONLY } from "@/constants/uiSizes";
import { formatKrwPreview, toAmountInputValue } from "@/utils/format";
import type { CategoryOut, RecurringFrequency, RecurringOut, TransactionType } from "@/types";

export interface RecurringFormValues {
  name: string;
  category_id: string;
  amount: string;
  type: TransactionType;
  frequency: RecurringFrequency;
  days_of_month: number[];
  start_date: string;
  end_date: string;
  reminder_days_before: string;
}

/** RecurringFormValues -> API 생성/수정 페이로드. 폼을 쓰는 모든 곳(반복 내역 관리 시트,
 * 현금흐름계획의 "반복내역으로 등록" 흐름)이 이 변환을 공유해 로직이 갈라지지 않게 한다. */
export function buildRecurringPayload(values: RecurringFormValues) {
  return {
    name: values.name,
    category_id: Number(values.category_id),
    amount: values.amount,
    type: values.type,
    frequency: values.frequency,
    days_of_month: values.frequency === "monthly" && values.days_of_month.length > 0 ? values.days_of_month : null,
    start_date: values.start_date,
    end_date: values.end_date || null,
    reminder_days_before: Number(values.reminder_days_before),
  };
}

const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};

const DAYS_IN_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

/** 수정 모드(RecurringOut 전체)와 프리필 전용 등록(값 일부만, 예: 현금흐름 계획 항목 연결) 양쪽에서 쓰인다 —
 * 이 컴포넌트는 아래 필드들만 읽으므로 `id`/`category`/`is_active`/`next_due_date` 등은 없어도 된다. */
type RecurringPrefill = Partial<
  Pick<
    RecurringOut,
    "name" | "category_id" | "amount" | "type" | "frequency" | "days_of_month" | "start_date" | "end_date" | "reminder_days_before"
  >
>;

interface Props {
  categories: CategoryOut[];
  initial?: RecurringPrefill;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: RecurringFormValues) => void;
}

export default function RecurringForm({ categories, initial, submitLabel, submitting, onSubmit }: Props) {
  const [values, setValues] = useState<RecurringFormValues>({
    name: initial?.name ?? "",
    category_id: initial?.category_id != null ? String(initial.category_id) : "",
    amount: toAmountInputValue(initial?.amount),
    type: initial?.type ?? "expense",
    frequency: initial?.frequency ?? "monthly",
    days_of_month: initial?.days_of_month ?? [],
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
    reminder_days_before: String(initial?.reminder_days_before ?? 3),
  });

  const toggleDay = (day: number) => {
    setValues((v) => ({
      ...v,
      days_of_month: v.days_of_month.includes(day)
        ? v.days_of_month.filter((d) => d !== day)
        : [...v.days_of_month, day].sort((a, b) => a - b),
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!values.name.trim() || !values.category_id || !values.start_date) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {(["expense", "income"] as TransactionType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setValues((v) => ({ ...v, type: t, category_id: "" }))}
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
        label="항목명"
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        required
      />
      <CategoryPicker
        categories={categories}
        kind={values.type}
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
      {values.frequency === "monthly" && (
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>
            반복 일자 {values.days_of_month.length === 0 && "(선택 안 하면 시작일 기준)"}
          </label>
          <div className="grid grid-cols-7 gap-1">
            {DAYS_IN_MONTH.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`rounded-md text-xs font-medium transition-colors ${TOUCH_TARGET_COMPACT_MOBILE_ONLY} ${
                  values.days_of_month.includes(day)
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      )}
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
