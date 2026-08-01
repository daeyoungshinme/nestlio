import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { formatKrwPreview } from "@/utils/format";
import { monthsRemainingInYear } from "@/utils/installment";

export interface CashflowPlanSplitFormValues {
  name: string;
  total_amount: string;
  start_year_month: string;
}

interface Props {
  defaultStartYearMonth: string;
  submitting?: boolean;
  onSubmit: (values: CashflowPlanSplitFormValues) => void;
}

export default function CashflowPlanSplitForm({ defaultStartYearMonth, submitting, onSubmit }: Props) {
  const [values, setValues] = useState<CashflowPlanSplitFormValues>({
    name: "",
    total_amount: "",
    start_year_month: defaultStartYearMonth,
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!values.name.trim() || !values.total_amount) return;
    onSubmit(values);
  };

  const months = monthsRemainingInYear(values.start_year_month);
  const perMonth = Number(values.total_amount) > 0 ? Number(values.total_amount) / months : 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        총액을 입력하면 선택한 시작월부터 그 해 12월까지 남은 개월 수로 나눠서 계획 항목으로 등록돼요. 등록 후에는
        각 달의 항목을 따로 수정·삭제할 수 있어요.
      </p>
      <FormInput
        label="항목명"
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        required
      />
      <FormInput
        label="시작월"
        type="month"
        value={values.start_year_month}
        onChange={(e) => setValues((v) => ({ ...v, start_year_month: e.target.value }))}
        required
      />
      <FormInput
        label="총액"
        type="number"
        inputMode="decimal"
        value={values.total_amount}
        onChange={(e) => setValues((v) => ({ ...v, total_amount: e.target.value }))}
        required
        preview={perMonth > 0 ? `월 약 ${formatKrwPreview(perMonth)} × ${months}개월` : undefined}
      />
      <Button type="submit" loading={submitting} className="w-full justify-center">
        {months}개월로 나눠 등록
      </Button>
    </form>
  );
}
