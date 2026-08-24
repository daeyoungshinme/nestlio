import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/common/Modal";
import Tabs from "@/components/common/Tabs";
import TransactionListItem from "@/components/transactions/TransactionListItem";
import ScheduleEventList from "@/components/schedule/ScheduleEventList";
import { formatDate } from "@/utils/format";
import type { EventOut, RecurringOut, TransactionOut, UserOut } from "@/types";

const TABS = ["내역", "일정"] as const;
type Tab = (typeof TABS)[number];

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
  onToggleComplete: (event: EventOut) => void;
}

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
  onToggleComplete,
}: Props) {
  const [tab, setTab] = useState<Tab>("내역");

  return (
    <Modal onClose={onClose} title={formatDate(date)}>
      <div className="p-6 space-y-4 overflow-y-auto">
        <Tabs tabs={TABS} activeTab={tab} onChange={setTab} variant="pill" />

        {tab === "내역" ? (
          <div className="space-y-4">
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
          </div>
        ) : (
          <div className="space-y-3">
            <ScheduleEventList
              events={events}
              recurringDue={recurringDue}
              description={
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  고정지출 납부일 등을 잊지 않게 도와주는 개인 일정·리마인더예요. 등록하면 알림 시각에 이메일로
                  알려드려요.
                </p>
              }
              onToggleComplete={onToggleComplete}
              readOnly
            />
            <Link
              to="/schedule"
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              전체 일정 관리 →
            </Link>
          </div>
        )}
      </div>
    </Modal>
  );
}
