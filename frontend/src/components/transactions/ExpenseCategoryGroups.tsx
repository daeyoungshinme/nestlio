import CollapsibleGroup from "@/components/common/CollapsibleGroup";
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
  if (groups.length === 0) {
    return <EmptyState title="해당 조건의 거래가 없어요" compact />;
  }

  const total = Number(totalExpense);

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const pct = total > 0 ? Math.round((Number(group.amount) / total) * 100) : 0;
        return (
          <CollapsibleGroup
            key={group.category_id}
            amount={formatKrw(group.amount)}
            header={
              <>
                <span
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: group.color }}
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
                  {group.name}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{pct}%</span>
              </>
            }
          >
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
          </CollapsibleGroup>
        );
      })}
    </div>
  );
}
