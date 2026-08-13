import Badge from "@/components/common/Badge";
import RowActionButtons from "@/components/common/RowActionButtons";
import { transactionAmountTextColor } from "@/utils/colors";
import { formatDate, formatKrw } from "@/utils/format";
import type { TransactionOut, UserOut } from "@/types";

interface Props {
  tx: TransactionOut;
  onEdit: (tx: TransactionOut) => void;
  onDelete: (tx: TransactionOut) => void;
  showDate?: boolean;
  showUser?: boolean;
  users?: UserOut[];
  hideCategoryBadge?: boolean;
}

export default function TransactionListItem({
  tx,
  onEdit,
  onDelete,
  showDate,
  showUser,
  users,
  hideCategoryBadge,
}: Props) {
  const ownerLabel = tx.owner_user_id
    ? (users?.find((u) => u.id === tx.owner_user_id)?.display_name ?? "공통")
    : "공통";
  return (
    <div className="card flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge type={tx.type} label={tx.type === "income" ? "수입" : "지출"} />
          {!hideCategoryBadge && <Badge type={tx.category.type} label={tx.category.name} />}
          {tx.savings_product && (
            <span className="text-xs text-gray-400 dark:text-gray-500">→ {tx.savings_product.name}</span>
          )}
          {showUser && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{ownerLabel}</span>
          )}
          {showDate && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(tx.transaction_date)}</span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
          {tx.description || tx.category.name}
        </p>
        <p className={`text-sm font-bold ${transactionAmountTextColor(tx.type)}`}>
          {tx.type === "income" ? "+" : "-"}
          {formatKrw(tx.amount)}
        </p>
      </div>
      <RowActionButtons onEdit={() => onEdit(tx)} onDelete={() => onDelete(tx)} />
    </div>
  );
}
