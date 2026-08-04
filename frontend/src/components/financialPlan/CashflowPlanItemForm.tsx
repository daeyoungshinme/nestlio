import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import CategoryPicker from "@/components/common/CategoryPicker";
import FormInput from "@/components/common/FormInput";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { formatKrw, formatKrwPreview, toAmountInputValue } from "@/utils/format";
import type { CashflowSection, CategoryOut, UserOut } from "@/types";

export interface CashflowPlanItemFormValues {
  name: string;
  owner_user_id: string;
  amount: string;
  category_id: string;
}

interface Props {
  section: CashflowSection;
  users: UserOut[] | undefined;
  categories: CategoryOut[];
  /** category_id -> 이번 달 그 카테고리에 이미 태깅된 계획 항목들의 합 (이 항목 자신의 몫은 제외) */
  categoryPlannedTotals: Record<number, string>;
  initialValues?: Partial<CashflowPlanItemFormValues>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: CashflowPlanItemFormValues) => void;
}

export default function CashflowPlanItemForm({
  section,
  users,
  categories,
  categoryPlannedTotals,
  initialValues,
  submitLabel,
  submitting,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<CashflowPlanItemFormValues>({
    name: initialValues?.name ?? "",
    owner_user_id: initialValues?.owner_user_id ?? "",
    amount: toAmountInputValue(initialValues?.amount),
    category_id: initialValues?.category_id ?? "",
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) return;
    onSubmit(values);
  };

  const sectionCategories = categories.filter((c) => c.type === section);
  const plannedForSelected = values.category_id ? categoryPlannedTotals[Number(values.category_id)] : undefined;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {section !== "income" && sectionCategories.length > 0 && (
        <div>
          <CategoryPicker
            categories={sectionCategories}
            value={values.category_id}
            onChange={(categoryId) =>
              setValues((v) => ({
                ...v,
                category_id: categoryId,
                name: v.name.trim() === "" && categoryId
                  ? (sectionCategories.find((c) => String(c.id) === categoryId)?.name ?? v.name)
                  : v.name,
              }))
            }
            label="카테고리 (선택)"
            placeholder="카테고리 없이 자유 입력"
            className="w-full"
          />
          {plannedForSelected !== undefined && Number(plannedForSelected) > 0 && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              이 카테고리에 이미 계획된 금액: {formatKrw(plannedForSelected)}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            카테고리를 고르면 대시보드 코칭 인사이트가 이 항목을 실제 지출과 비교해줘요.
          </p>
        </div>
      )}
      <FormInput
        label="항목명"
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        required
      />
      {section === "income" && (
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>구분</label>
          <select
            className={`${INPUT_SM} w-full`}
            value={values.owner_user_id}
            onChange={(e) => setValues((v) => ({ ...v, owner_user_id: e.target.value }))}
          >
            <option value="">공통</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>
        </div>
      )}
      <FormInput
        label="금액"
        type="number"
        inputMode="decimal"
        value={values.amount}
        onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
        required
        preview={Number(values.amount) > 0 ? formatKrwPreview(Number(values.amount)) : undefined}
      />
      <Button type="submit" loading={submitting} className="w-full justify-center">
        {submitLabel}
      </Button>
    </form>
  );
}
