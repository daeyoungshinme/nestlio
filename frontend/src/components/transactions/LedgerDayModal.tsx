import { useState } from "react";
import { CalendarDays, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import Modal from "@/components/common/Modal";
import Tabs from "@/components/common/Tabs";
import TransactionListItem from "@/components/transactions/TransactionListItem";
import { formatDate, formatKrw } from "@/utils/format";
import { googleImportedEventBadgeStyle } from "@/utils/colors";
import type { EventFrequency, EventOut, RecurringOut, TransactionOut, UserOut } from "@/types";

const FREQUENCY_LABEL: Record<EventFrequency, string> = { once: "한 번", weekly: "매주", monthly: "매월" };

function occurrenceTime(iso: string): string {
  const timePart = iso.split("T")[1];
  return timePart ? timePart.slice(0, 5) : "";
}

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
  onAddEvent: () => void;
  onEditEvent: (event: EventOut) => void;
  onDeleteEvent: (event: EventOut) => void;
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
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
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
          <div className="space-y-4">
            <Button size="sm" icon={<Plus size={14} />} onClick={onAddEvent}>
              일정 추가
            </Button>

            {recurringDue.length > 0 && (
              <div className="space-y-2">
                {recurringDue.map((recurring) => (
                  <div
                    key={recurring.id}
                    className="card flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <Repeat size={14} className="shrink-0 text-indigo-500" aria-hidden="true" />
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{recurring.name}</p>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shrink-0">
                        반복 내역 예정
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">
                      {formatKrw(recurring.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {events.length === 0 ? (
              recurringDue.length === 0 && <EmptyState icon={CalendarDays} title="등록된 일정이 없어요" compact />
            ) : (
              <div className="space-y-2">
                {events.map((event) => {
                  const time = occurrenceTime(event.occurrence_start);
                  return (
                    <div key={event.id} className="card flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{event.title}</p>
                          {event.frequency !== "once" && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                              {FREQUENCY_LABEL[event.frequency]}
                            </span>
                          )}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                            {event.creator.display_name}
                          </span>
                          {event.source === "google_import" && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${googleImportedEventBadgeStyle()}`}
                            >
                              Google 캘린더
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {event.all_day ? "종일" : time}
                          {event.location ? ` · ${event.location}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {event.source !== "google_import" && (
                          <button
                            onClick={() => onEditEvent(event)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
                            aria-label="수정"
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteEvent(event)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                          aria-label="삭제"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
