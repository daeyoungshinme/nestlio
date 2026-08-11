import StatusBadge from "@/components/common/StatusBadge";
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
  return <StatusBadge label={label} toneClassName={style} className={className} />;
}
