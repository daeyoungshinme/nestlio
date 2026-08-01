import { categoryTypeBadgeStyle, transactionTypeBadgeStyle } from "@/utils/colors";

interface Props {
  type: "fixed" | "variable" | "irregular" | "income" | "expense";
  label: string;
  className?: string;
}

export default function Badge({ type, label, className }: Props) {
  const style =
    type === "fixed" || type === "variable" || type === "irregular"
      ? categoryTypeBadgeStyle(type)
      : transactionTypeBadgeStyle(type);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style} ${className ?? ""}`}
    >
      {label}
    </span>
  );
}
