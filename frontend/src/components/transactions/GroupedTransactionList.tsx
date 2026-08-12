import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import EmptyState from "@/components/common/EmptyState";
import TransactionListItem from "@/components/transactions/TransactionListItem";
import type { TransactionOut, UserOut } from "@/types";

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
  /** Whether this group starts expanded. Defaults to true (existing behavior). */
  defaultOpen?: boolean;
}

interface Props {
  groups: TransactionGroup[];
  onEdit: (tx: TransactionOut) => void;
  onDelete: (tx: TransactionOut) => void;
  /** Shown when `groups` is empty. Omit to render nothing (e.g. caller already handles the empty state). */
  emptyTitle?: string;
  /** Whether to render the colored dot in each group header. Defaults to true. */
  showDot?: boolean;
  /** Passed through to each TransactionListItem. Defaults to true (existing behavior). */
  itemShowDate?: boolean;
  /** Passed through to each TransactionListItem. Defaults to true (existing behavior). */
  itemHideCategoryBadge?: boolean;
  /** Passed through to each TransactionListItem. Defaults to false. */
  showUser?: boolean;
  /** Passed through to each TransactionListItem, used to resolve owner_user_id → display_name. */
  users?: UserOut[];
}

/** Shared "dot + name + amount, collapsible, list of transactions" grouped-list UI,
 * used for category groups (ExpenseCategoryGroups), savings-product groups
 * (SavingsLinkedTransactionsSection), and day groups (DailyTransactionGroups) —
 * only how the groups are computed differs. */
export default function GroupedTransactionList({
  groups,
  onEdit,
  onDelete,
  emptyTitle,
  showDot = true,
  itemShowDate = true,
  itemHideCategoryBadge = true,
  showUser = false,
  users,
}: Props) {
  if (groups.length === 0) {
    return emptyTitle ? <EmptyState title={emptyTitle} compact /> : null;
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <CollapsibleGroup
          key={group.key}
          amount={group.amountLabel}
          defaultOpen={group.defaultOpen ?? true}
          header={
            <>
              {showDot && (
                <span
                  className={`size-2.5 rounded-full shrink-0 ${group.dotColor ? "" : (group.dotClassName ?? "")}`}
                  style={group.dotColor ? { backgroundColor: group.dotColor } : undefined}
                  aria-hidden="true"
                />
              )}
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{group.name}</span>
              {group.pctLabel && (
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{group.pctLabel}</span>
              )}
            </>
          }
        >
          {group.transactions.map((tx) => (
            <TransactionListItem
              key={tx.id}
              tx={tx}
              onEdit={onEdit}
              onDelete={onDelete}
              showDate={itemShowDate}
              hideCategoryBadge={itemHideCategoryBadge}
              showUser={showUser}
              users={users}
            />
          ))}
        </CollapsibleGroup>
      ))}
    </div>
  );
}
