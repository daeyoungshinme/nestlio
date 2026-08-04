import { Pencil, Trash2 } from "lucide-react";
import Badge from "@/components/common/Badge";
import { transactionAmountTextColor } from "@/utils/colors";
import { formatDate, formatKrw } from "@/utils/format";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import type { TransactionOut } from "@/types";

interface Props {
  tx: TransactionOut;
  onEdit: (tx: TransactionOut) => void;
  onDelete: (tx: TransactionOut) => void;
  showDate?: boolean;
  hideCategoryBadge?: boolean;
}

export default function TransactionListItem({ tx, onEdit, onDelete, showDate, hideCategoryBadge }: Props) {
  return (
    <div className="card flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge type={tx.type} label={tx.type === "income" ? "수입" : "지출"} />
          {!hideCategoryBadge && <Badge type={tx.category.type} label={tx.category.name} />}
          {tx.savings_product && (
            <span className="text-xs text-gray-400 dark:text-gray-500">→ {tx.savings_product.name}</span>
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
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(tx)}
          className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors`}
          aria-label="수정"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => onDelete(tx)}
          className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors`}
          aria-label="삭제"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
