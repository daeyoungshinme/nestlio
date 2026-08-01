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
  className = "w-32",
}: Props) {
  const options = kind ? categories.filter((c) => c.kind === kind) : categories;

  return (
    <div>
      <label className={`block mb-1 font-medium ${LABEL_SM}`}>{label}</label>
      <select
        className={`${INPUT_SM} ${className}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
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
