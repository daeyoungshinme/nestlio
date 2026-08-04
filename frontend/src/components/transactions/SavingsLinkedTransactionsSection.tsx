import { useMemo } from "react";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import TransactionListItem from "@/components/transactions/TransactionListItem";
import { formatKrw } from "@/utils/format";
import { savingsProductTypeDotClass } from "@/utils/colors";
import type { SavingsProductType, TransactionOut } from "@/types";

interface Props {
  transactions: TransactionOut[];
  onEdit: (tx: TransactionOut) => void;
  onDelete: (tx: TransactionOut) => void;
}

interface ProductGroup {
  key: string;
  productName: string;
  productType: SavingsProductType | undefined;
  transactions: TransactionOut[];
  total: number;
}

const UNASSIGNED_KEY = "unassigned";

export default function SavingsLinkedTransactionsSection({ transactions, onEdit, onDelete }: Props) {
  const groups = useMemo(() => {
    const groupsByProduct = new Map<string, ProductGroup>();
    for (const tx of transactions) {
      const key = tx.savings_product_id != null ? String(tx.savings_product_id) : UNASSIGNED_KEY;
      const group = groupsByProduct.get(key) ?? {
        key,
        productName: tx.savings_product?.name ?? "상품 미지정",
        productType: tx.savings_product?.product_type,
        transactions: [],
        total: 0,
      };
      group.transactions.push(tx);
      group.total += Number(tx.amount);
      groupsByProduct.set(key, group);
    }
    return Array.from(groupsByProduct.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [transactions]);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <CollapsibleGroup
          key={group.key}
          amount={formatKrw(group.total)}
          header={
            <>
              <span
                className={`size-2.5 rounded-full shrink-0 ${savingsProductTypeDotClass(group.productType)}`}
                aria-hidden="true"
              />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
                {group.productName}
              </span>
            </>
          }
        >
          {group.transactions.map((tx) => (
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
      ))}
    </div>
  );
}
