import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { formatKrwPreview, toAmountInputValue } from "@/utils/format";
import type { CashflowSection, UserOut } from "@/types";

export interface CashflowPlanItemFormValues {
  name: string;
  owner_user_id: string;
  amount: string;
}

interface Props {
  section: CashflowSection;
  users: UserOut[] | undefined;
  initialValues?: Partial<CashflowPlanItemFormValues>;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: CashflowPlanItemFormValues) => void;
}

export default function CashflowPlanItemForm({
  section,
  users,
  initialValues,
  submitLabel,
  submitting,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<CashflowPlanItemFormValues>({
    name: initialValues?.name ?? "",
    owner_user_id: initialValues?.owner_user_id ?? "",
    amount: toAmountInputValue(initialValues?.amount),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) return;
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
