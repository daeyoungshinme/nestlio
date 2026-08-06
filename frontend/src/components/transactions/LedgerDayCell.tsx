import { memo } from "react";
import { Repeat } from "lucide-react";
import { transactionAmountTextColor, transactionTypeBadgeStyle } from "@/utils/colors";
import { formatKrw, formatKrwCompact } from "@/utils/format";
import type { EventOut, RecurringOut, TransactionOut } from "@/types";

interface Props {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  transactions: TransactionOut[];
  events: EventOut[];
  recurringDue: RecurringOut[];
  onSelect: (date: string) => void;
}

const MAX_VISIBLE_EVENTS = 1;
const MAX_VISIBLE_RECURRING = 1;

function LedgerDayCell({
  date,
  day,
  inCurrentMonth,
  isToday,
  transactions,
  events,
  recurringDue,
  onSelect,
}: Props) {
  const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + Number(t.amount), 0);
  const expense = transactions
    .filter((t) => t.type === "expense" && !t.category.is_savings)
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const showIncome = income > 0;
  const showExpense = expense > 0;

  const visibleRecurring = recurringDue.slice(0, MAX_VISIBLE_RECURRING);
  const recurringOverflow = recurringDue.length - visibleRecurring.length;
  const visibleEvents = events.slice(0, MAX_VISIBLE_EVENTS);
  const eventOverflow = events.length - visibleEvents.length;

  return (
    <button
      type="button"
      disabled={!inCurrentMonth}
      onClick={() => onSelect(date)}
      className={`flex flex-col items-start gap-0.5 min-h-16 sm:min-h-24 lg:min-h-28 p-1 sm:p-1.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 text-left transition-colors ${
        inCurrentMonth ? "hover:bg-gray-50 dark:hover:bg-gray-800" : "opacity-40 cursor-default"
      }`}
    >
      <span
        className={`text-xs sm:text-sm font-medium ${
          isToday
            ? "bg-blue-600 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center"
            : "text-gray-700 dark:text-gray-300"
        }`}
      >
        {day}
      </span>
      {showIncome && (
        <span
          className={`text-[10px] sm:text-xs font-medium truncate w-full ${transactionAmountTextColor("income")}`}
          title={formatKrw(income)}
        >
          +{formatKrwCompact(income)}
        </span>
      )}
      {showExpense && (
        <span
          className={`text-[10px] sm:text-xs font-medium truncate w-full ${transactionAmountTextColor("expense")}`}
          title={formatKrw(expense)}
        >
          -{formatKrwCompact(expense)}
        </span>
      )}
      {transactions.length > 1 && (
        <span className="text-[9px] text-gray-400 dark:text-gray-500">{transactions.length}건</span>
      )}
      {visibleRecurring.map((recurring) => (
        <span
          key={`recurring-${recurring.id}`}
          className={`inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-medium truncate w-full px-1 py-0.5 rounded ${transactionTypeBadgeStyle(recurring.type)}`}
          title={`${recurring.name} (반복 내역 예정)`}
        >
          <Repeat size={10} className="shrink-0" aria-hidden="true" />
          {recurring.name}
        </span>
      ))}
      {recurringOverflow > 0 && (
        <span className="text-[9px] text-gray-400 dark:text-gray-500">+{recurringOverflow}</span>
      )}
      {visibleEvents.map((event) => (
        <span
          key={event.id}
          className="text-[10px] sm:text-xs font-medium truncate w-full px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
          title={event.title}
        >
          {event.title}
        </span>
      ))}
      {eventOverflow > 0 && <span className="text-[9px] text-gray-400 dark:text-gray-500">+{eventOverflow}</span>}
    </button>
  );
}

export default memo(LedgerDayCell);
