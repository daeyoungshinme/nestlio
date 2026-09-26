import { ArrowLeft, Plus } from "lucide-react";
import type { ReactNode } from "react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/common/Modal";
import ScheduleEventList from "@/components/schedule/ScheduleEventList";
import TransactionListItem from "@/components/transactions/TransactionListItem";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { formatDate } from "@/utils/format";
import type { EventOut, RecurringOut, TransactionOut, UserOut } from "@/types";

interface Props {
  date: string;
  transactions: TransactionOut[];
  events: EventOut[];
  recurringDue: RecurringOut[];
  showUser?: boolean;
  users?: UserOut[];
  /** 추가·수정 폼을 모달을 닫지 않고 시트 안에서 띄울 때의 화면. 있으면 목록 대신 이걸 보여주고,
   * 저장·"목록으로"(onBack) 후 그날 목록으로 돌아온다. */
  panel?: { title: string; content: ReactNode } | null;
  onBack: () => void;
  onClose: () => void;
  onAddTransaction: () => void;
  onEditTransaction: (tx: TransactionOut) => void;
  onDeleteTransaction: (tx: TransactionOut) => void;
  onAddEvent: () => void;
  onEditEvent: (event: EventOut) => void;
  onDeleteEvent: (event: EventOut) => void;
  onToggleEventComplete: (event: EventOut) => void;
}

/** 캘린더 날짜를 탭했을 때 뜨는 그날의 모달 — 그날 거래와 부부 일정(+예정된 반복 거래)을 한 곳에서 보고
 * 추가·수정한다. 구 버전은 거래 전용이라 일정은 `/schedule?date=` 링크로 다른 페이지에 넘겼는데, 일정이 가계부에
 * 병합되면서 페이지 이동 없이 여기서 처리한다. 추가·수정 폼은 모달을 닫고 새 모달을 여는 대신 같은 시트 안에서
 * 전환(`panel`)하고, 저장하면 그날 목록으로 돌아온다 — 하루치를 연달아 입력할 때 날짜를 다시 고르지 않게.
 * 삭제 확인은 이 시트 위에 겹쳐 뜬다(ConfirmModal이 더 높은 z-index). */
export default function LedgerDayModal({
  date,
  transactions,
  events,
  recurringDue,
  showUser,
  users,
  panel,
  onBack,
  onClose,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onToggleEventComplete,
}: Props) {
  if (panel) {
    return (
      <Modal onClose={onClose} title={panel.title}>
        <div className="p-6 space-y-3 overflow-y-auto">
          <button
            type="button"
            onClick={onBack}
            className={`${TOUCH_TARGET_MIN_HEIGHT} inline-flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-50`}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {formatDate(date)} 목록으로
          </button>
          {panel.content}
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={formatDate(date)}>
      <div className="p-6 space-y-5 overflow-y-auto">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">내역</h3>
            <Button size="sm" icon={<Plus size={14} />} onClick={onAddTransaction}>
              내역 추가
            </Button>
          </div>
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
        </section>

        <section className="space-y-2 pt-4 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">일정</h3>
          <ScheduleEventList
            events={events}
            recurringDue={recurringDue}
            onAdd={onAddEvent}
            onEdit={onEditEvent}
            onDelete={onDeleteEvent}
            onToggleComplete={onToggleEventComplete}
          />
        </section>
      </div>
    </Modal>
  );
}
