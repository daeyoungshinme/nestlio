import { useId } from "react";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import type { CategoryOut, TransactionType } from "@/types";

interface Props {
  categories: CategoryOut[];
  value: string;
  onChange: (categoryId: string) => void;
  kind?: TransactionType;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function CategoryPicker({
  categories,
  value,
  onChange,
  kind,
  label = "카테고리",
  placeholder,
  required,
  disabled,
  className = "w-32",
}: Props) {
  const fieldId = useId();
  const options = kind ? categories.filter((c) => c.kind === kind) : categories;

  return (
    <div>
      <label htmlFor={`${fieldId}-0`} className={`block mb-1 font-medium ${LABEL_SM}`}>{label}</label>
      <select
        id={`${fieldId}-0`}
        className={`${INPUT_SM} ${className} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
