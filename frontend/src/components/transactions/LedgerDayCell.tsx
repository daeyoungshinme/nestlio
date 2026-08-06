import { memo } from "react";
import { CalendarDays, Receipt, Repeat } from "lucide-react";
import { transactionAmountTextColor, transactionTypeBadgeStyle } from "@/utils/colors";
import { formatKrw, formatKrwCompact } from "@/utils/format";
import { LEDGER_DAY_CELL_MIN_HEIGHT } from "@/constants/uiSizes";
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

  const incomeRecurring = recurringDue.filter((r) => r.type === "income");
  const expenseRecurring = recurringDue.filter((r) => r.type === "expense");
  const hasBadgeRow = transactions.length > 0 || recurringDue.length > 0 || events.length > 0;

  return (
    <button
      type="button"
      disabled={!inCurrentMonth}
      onClick={() => onSelect(date)}
      className={`flex flex-col items-start gap-0.5 ${LEDGER_DAY_CELL_MIN_HEIGHT} p-1 sm:p-1.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 text-left transition-colors ${
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
      {hasBadgeRow && (
        <div className="flex flex-wrap items-center gap-1 w-full">
          {transactions.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-medium text-gray-400 dark:text-gray-500"
              title={`거래 ${transactions.length}건`}
            >
              <Receipt size={9} className="shrink-0" aria-hidden="true" />
              {transactions.length}
            </span>
          )}
          {incomeRecurring.length > 0 && (
            <span
              className={`inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-medium px-1 rounded ${transactionTypeBadgeStyle("income")}`}
              title={`반복 수입 예정 ${incomeRecurring.length}건: ${incomeRecurring.map((r) => r.name).join(", ")}`}
            >
              <Repeat size={9} className="shrink-0" aria-hidden="true" />
              {incomeRecurring.length}
            </span>
          )}
          {expenseRecurring.length > 0 && (
            <span
              className={`inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-medium px-1 rounded ${transactionTypeBadgeStyle("expense")}`}
              title={`반복 지출 예정 ${expenseRecurring.length}건: ${expenseRecurring.map((r) => r.name).join(", ")}`}
            >
              <Repeat size={9} className="shrink-0" aria-hidden="true" />
              {expenseRecurring.length}
            </span>
          )}
          {events.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-medium px-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              title={`일정 ${events.length}건: ${events.map((e) => e.title).join(", ")}`}
            >
              <CalendarDays size={9} className="shrink-0" aria-hidden="true" />
              {events.length}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

export default memo(LedgerDayCell);
