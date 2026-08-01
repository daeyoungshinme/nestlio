import { useState } from "react";
import { ChevronDown } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import TransactionListItem from "@/components/transactions/TransactionListItem";
import { formatKrw } from "@/utils/format";
import type { CategoryAmountOut, TransactionOut } from "@/types";

interface Props {
  groups: CategoryAmountOut[];
  transactionsByCategory: Map<number, TransactionOut[]>;
  totalExpense: string;
  onEdit: (tx: TransactionOut) => void;
  onDelete: (tx: TransactionOut) => void;
}

export default function ExpenseCategoryGroups({
  groups,
  transactionsByCategory,
  totalExpense,
  onEdit,
  onDelete,
}: Props) {
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({});
  const isOpen = (id: number) => openGroups[id] ?? true;
  const toggle = (id: number) => setOpenGroups((prev) => ({ ...prev, [id]: !isOpen(id) }));

  if (groups.length === 0) {
    return <EmptyState title="해당 조건의 거래가 없어요" compact />;
  }

  const total = Number(totalExpense);

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const pct = total > 0 ? Math.round((Number(group.amount) / total) * 100) : 0;
        const open = isOpen(group.category_id);
        return (
          <div key={group.category_id} className="space-y-2">
            <button
              type="button"
              onClick={() => toggle(group.category_id)}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-2 px-1 min-h-[44px]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: group.color }}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
                  {group.name}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{pct}%</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {formatKrw(group.amount)}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                />
              </div>
            </button>
            {open && (
              <div className="space-y-2">
                {(transactionsByCategory.get(group.category_id) ?? []).map((tx) => (
                  <TransactionListItem
                    key={tx.id}
                    tx={tx}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    showDate
                    hideCategoryBadge
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
