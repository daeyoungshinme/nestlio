import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import EmptyState from "@/components/common/EmptyState";
import TransactionListItem from "@/components/transactions/TransactionListItem";
import type { TransactionOut } from "@/types";

export interface TransactionGroup {
  key: string | number;
  name: string;
  amountLabel: string;
  /** Tailwind class for the header dot (e.g. savings-product type color). */
  dotClassName?: string;
  /** Inline color for the header dot (e.g. category color). Takes precedence over dotClassName. */
  dotColor?: string;
  pctLabel?: string;
  transactions: TransactionOut[];
}

interface Props {
  groups: TransactionGroup[];
  onEdit: (tx: TransactionOut) => void;
  onDelete: (tx: TransactionOut) => void;
  /** Shown when `groups` is empty. Omit to render nothing (e.g. caller already handles the empty state). */
  emptyTitle?: string;
}

/** Shared "dot + name + amount, collapsible, list of transactions" grouped-list UI,
 * used both for category groups (ExpenseCategoryGroups) and savings-product groups
 * (SavingsLinkedTransactionsSection) — only how the groups are computed differs. */
export default function GroupedTransactionList({ groups, onEdit, onDelete, emptyTitle }: Props) {
  if (groups.length === 0) {
    return emptyTitle ? <EmptyState title={emptyTitle} compact /> : null;
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <CollapsibleGroup
          key={group.key}
          amount={group.amountLabel}
          header={
            <>
              <span
                className={`size-2.5 rounded-full shrink-0 ${group.dotColor ? "" : (group.dotClassName ?? "")}`}
                style={group.dotColor ? { backgroundColor: group.dotColor } : undefined}
                aria-hidden="true"
              />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{group.name}</span>
              {group.pctLabel && (
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{group.pctLabel}</span>
              )}
            </>
          }
        >
          {group.transactions.map((tx) => (
            <TransactionListItem key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} showDate hideCategoryBadge />
          ))}
        </CollapsibleGroup>
      ))}
    </div>
  );
}
