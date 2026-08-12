import GroupedTransactionList from "@/components/transactions/GroupedTransactionList";
import { formatKrw } from "@/utils/format";
import type { CategoryAmountOut, TransactionOut, UserOut } from "@/types";

interface Props {
  groups: CategoryAmountOut[];
  transactionsByCategory: Map<number, TransactionOut[]>;
  totalExpense: string;
  onEdit: (tx: TransactionOut) => void;
  onDelete: (tx: TransactionOut) => void;
  showUser?: boolean;
  users?: UserOut[];
}

export default function ExpenseCategoryGroups({
  groups,
  transactionsByCategory,
  totalExpense,
  onEdit,
  onDelete,
  showUser,
  users,
}: Props) {
  const total = Number(totalExpense);
  const rows = groups.map((group) => ({
    key: group.category_id,
    name: group.name,
    amountLabel: formatKrw(group.amount),
    dotColor: group.color,
    pctLabel: `${total > 0 ? Math.round((Number(group.amount) / total) * 100) : 0}%`,
    transactions: transactionsByCategory.get(group.category_id) ?? [],
  }));

  return (
    <GroupedTransactionList
      groups={rows}
      onEdit={onEdit}
      onDelete={onDelete}
      emptyTitle="해당 조건의 내역이 없어요"
      showUser={showUser}
      users={users}
    />
  );
}
