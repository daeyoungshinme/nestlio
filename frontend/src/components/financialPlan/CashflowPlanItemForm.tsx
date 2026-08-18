import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
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
  /** 반복거래에 연동된 항목이면 금액/카테고리는 연동된 반복거래 값을 그대로 따라가므로 여기서 수정할 수 없다. */
  isRecurringLinked?: boolean;
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
  isRecurringLinked,
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
      {isRecurringLinked && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          반복 거래에 연동된 항목이라 금액/카테고리는 반복 거래 규칙을 그대로 따라가요.{" "}
          <Link to="/transactions?recurring=manage" className="underline font-medium">
            반복 거래 규칙 수정하기
          </Link>
        </p>
      )}
      {section !== "income" && sectionCategories.length > 0 && (
        <div>
          {!isRecurringLinked && (
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
              카테고리를 고르면 이 항목이 가계부의 실제 지출과 자동으로 비교되고, 대시보드 초과지출
              코칭에도 반영돼요.
            </p>
          )}
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
            label="카테고리"
            placeholder="선택 안 함 (자유 입력 항목)"
            className="w-full"
            disabled={isRecurringLinked}
          />
          {plannedForSelected !== undefined && Number(plannedForSelected) > 0 && (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              이 카테고리에 이미 계획된 금액: {formatKrw(plannedForSelected)}
            </p>
          )}
        </div>
      )}
      <FormInput
        label="항목명"
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        required
      />
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
      <FormInput
        label="금액"
        type="number"
        inputMode="decimal"
        value={values.amount}
        onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))}
        required
        disabled={isRecurringLinked}
        preview={Number(values.amount) > 0 ? formatKrwPreview(Number(values.amount)) : undefined}
      />
      <Button type="submit" loading={submitting} className="w-full justify-center">
        {submitLabel}
      </Button>
    </form>
  );
}
