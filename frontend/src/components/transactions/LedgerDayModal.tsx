import { Link } from "react-router-dom";
import { CalendarDays, Plus } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/common/Modal";
import TransactionListItem from "@/components/transactions/TransactionListItem";
import { formatDate } from "@/utils/format";
import type { EventOut, RecurringOut, TransactionOut, UserOut } from "@/types";

interface Props {
  date: string;
  transactions: TransactionOut[];
  events: EventOut[];
  recurringDue: RecurringOut[];
  showUser?: boolean;
  users?: UserOut[];
  onClose: () => void;
  onAddTransaction: () => void;
  onEditTransaction: (tx: TransactionOut) => void;
  onDeleteTransaction: (tx: TransactionOut) => void;
}

/** 캘린더 날짜를 탭했을 때 뜨는 그날의 거래 목록 모달 — 거래 전용이다. 일정은 `/schedule`에서
 * 담당자 배분·완료 체크와 함께 관리하므로 여기서는 건수만 알려주고 링크로 넘긴다. */
export default function LedgerDayModal({
  date,
  transactions,
  events,
  recurringDue,
  showUser,
  users,
  onClose,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
}: Props) {
  const scheduleCount = events.length + recurringDue.length;

  return (
    <Modal onClose={onClose} title={formatDate(date)}>
      <div className="p-6 space-y-4 overflow-y-auto">
        <Button size="sm" icon={<Plus size={14} />} onClick={onAddTransaction}>
          내역 추가
        </Button>

        {transactions.length === 0 ? (
          <EmptyState title="내역이 없어요" compact />
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <TransactionListItem
                key={tx.id}
                tx={tx}
                onEdit={onEditTransaction}
                onDelete={onDeleteTransaction}
                showUser={showUser}
                users={users}
              />
            ))}
          </div>
        )}

        <Link
          to={`/schedule?date=${date}`}
          className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400"
        >
          <CalendarDays size={14} aria-hidden="true" />
          {scheduleCount > 0 ? `이 날 일정 ${scheduleCount}건 보기` : "이 날 일정 추가·관리"} →
        </Link>
      </div>
    </Modal>
  );
}
