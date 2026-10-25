import { useMemo } from "react";
import GroupedTransactionList from "@/components/transactions/GroupedTransactionList";
import { formatDayHeader } from "@/utils/date";
import { formatKrw } from "@/utils/format";
import type { TransactionOut, UserOut } from "@/types";

interface Props {
  /** Already filtered and sorted by transaction_date desc, then id desc. */
  transactions: TransactionOut[];
  onEdit: (tx: TransactionOut) => void;
  showUser: boolean;
  users?: UserOut[];
  /** 필터 결과가 비었을 때 "필터 초기화" 액션. */
  emptyAction?: { label: string; onClick: () => void };
}

/** 한 달 거래가 이 이하면 전부 펼친다 — 접힌 날을 하나씩 여는 수고가 스크롤보다 크다. */
const EXPAND_ALL_MAX_TRANSACTIONS = 20;
/** 그보다 많으면 최근 며칠만 펼친다(오늘이 없는 지난달도 마지막 며칠은 바로 보이게). */
const RECENT_OPEN_DAYS = 3;

/** Groups an already-sorted transaction list by day into collapsible sections, reusing the
 * same dot/name/amount header pattern as ExpenseCategoryGroups/SavingsLinkedTransactionsSection.
 * 거래가 적으면 전부, 많으면 최근 RECENT_OPEN_DAYS일만 펼친다. */
export default function DailyTransactionGroups({ transactions, onEdit, showUser, users, emptyAction }: Props) {

  const groups = useMemo(() => {
    const byDate = new Map<string, TransactionOut[]>();
    for (const tx of transactions) {
      const list = byDate.get(tx.transaction_date) ?? [];
      list.push(tx);
      byDate.set(tx.transaction_date, list);
    }
    const expandAll = transactions.length <= EXPAND_ALL_MAX_TRANSACTIONS;
    return Array.from(byDate.entries()).map(([date, txs], index) => {
      const net = txs.reduce((sum, tx) => sum + (tx.type === "income" ? 1 : -1) * Number(tx.amount), 0);
      return {
        key: date,
        name: formatDayHeader(date),
        amountLabel: `${net >= 0 ? "+" : "-"}${formatKrw(Math.abs(net))}`,
        transactions: txs,
        defaultOpen: expandAll || index < RECENT_OPEN_DAYS,
      };
    });
  }, [transactions]);

  return (
    <GroupedTransactionList
      groups={groups}
      onEdit={onEdit}
      showDot={false}
      itemShowDate={false}
      itemHideCategoryBadge={false}
      showUser={showUser}
      users={users}
      emptyTitle="해당 조건의 내역이 없어요"
      emptyAction={emptyAction}
    />
  );
}
