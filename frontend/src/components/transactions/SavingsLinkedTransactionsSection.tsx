import { useMemo } from "react";
import GroupedTransactionList from "@/components/transactions/GroupedTransactionList";
import { formatKrw } from "@/utils/format";
import { savingsProductTypeDotClass } from "@/utils/colors";
import type { SavingsProductType, TransactionOut, UserOut } from "@/types";

interface Props {
  transactions: TransactionOut[];
  onEdit: (tx: TransactionOut) => void;
  onDelete: (tx: TransactionOut) => void;
  showUser?: boolean;
  users?: UserOut[];
}

const UNASSIGNED_KEY = "unassigned";

export default function SavingsLinkedTransactionsSection({
  transactions,
  onEdit,
  onDelete,
  showUser,
  users,
}: Props) {
  const groups = useMemo(() => {
    const groupsByProduct = new Map<
      string,
      { name: string; productType: SavingsProductType | undefined; transactions: TransactionOut[]; total: number }
    >();
    for (const tx of transactions) {
      const key = tx.savings_product_id != null ? String(tx.savings_product_id) : UNASSIGNED_KEY;
      const group = groupsByProduct.get(key) ?? {
        name: tx.savings_product?.name ?? "상품 미지정",
        productType: tx.savings_product?.product_type,
        transactions: [],
        total: 0,
      };
      group.transactions.push(tx);
      group.total += Number(tx.amount);
      groupsByProduct.set(key, group);
    }
    return Array.from(groupsByProduct.entries())
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .map(([key, group]) => ({
        key,
        name: group.name,
        amountLabel: formatKrw(group.total),
        dotClassName: savingsProductTypeDotClass(group.productType),
        transactions: group.transactions,
      }));
  }, [transactions]);

  return (
    <GroupedTransactionList
      groups={groups}
      onEdit={onEdit}
      onDelete={onDelete}
      showUser={showUser}
      users={users}
    />
  );
}
