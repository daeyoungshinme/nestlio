import { useMemo } from "react";
import GroupedTransactionList from "@/components/transactions/GroupedTransactionList";
import { formatKrw } from "@/utils/format";
import type { TransactionOut, UserOut } from "@/types";

interface Props {
  /** Already filtered and sorted by transaction_date desc, then id desc. */
  transactions: TransactionOut[];
  onEdit: (tx: TransactionOut) => void;
  onDelete: (tx: TransactionOut) => void;
  showUser: boolean;
  users?: UserOut[];
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayHeader(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
  return `${m}.${d} (${weekday})`;
}

/** Groups an already-sorted transaction list by day into collapsible sections, reusing the
 * same dot/name/amount header pattern as ExpenseCategoryGroups/SavingsLinkedTransactionsSection.
 * Only today's group starts expanded, to keep the mobile scroll short while still showing
 * newly-added transactions right away. */
export default function DailyTransactionGroups({ transactions, onEdit, onDelete, showUser, users }: Props) {
  const today = todayIso();

  const groups = useMemo(() => {
    const byDate = new Map<string, TransactionOut[]>();
    for (const tx of transactions) {
      const list = byDate.get(tx.transaction_date) ?? [];
      list.push(tx);
      byDate.set(tx.transaction_date, list);
    }
    return Array.from(byDate.entries()).map(([date, txs]) => {
      const net = txs.reduce((sum, tx) => sum + (tx.type === "income" ? 1 : -1) * Number(tx.amount), 0);
      return {
        key: date,
        name: formatDayHeader(date),
        amountLabel: `${net >= 0 ? "+" : "-"}${formatKrw(Math.abs(net))}`,
        transactions: txs,
        defaultOpen: date === today,
      };
    });
  }, [transactions, today]);

  return (
    <GroupedTransactionList
      groups={groups}
      onEdit={onEdit}
      onDelete={onDelete}
      showDot={false}
      itemShowDate={false}
      itemHideCategoryBadge={false}
      showUser={showUser}
      users={users}
      emptyTitle="해당 조건의 내역이 없어요"
    />
  );
}
