import { memo } from "react";
import type { ReactNode } from "react";
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
  // 모바일은 셀이 좁아 수입·지출·배지를 다 넣으면 행 높이가 들쭉날쭉해진다 — 순액 한 줄 + 활동
  // 점만 보여주고 상세는 날짜를 눌러 모달에서 본다.
  const net = income - expense;
  const hasSchedule = events.length > 0 || recurringDue.length > 0;

  const incomeRecurring = recurringDue.filter((r) => r.type === "income");
  const expenseRecurring = recurringDue.filter((r) => r.type === "expense");
  const hasBadgeRow = transactions.length > 0 || recurringDue.length > 0 || events.length > 0;

  const badgeItems: { key: string; node: ReactNode }[] = [];
  if (incomeRecurring.length > 0) {
    badgeItems.push({
      key: "income-recurring",
      node: (
        <span
          className={`inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-medium px-1 rounded ${transactionTypeBadgeStyle("income")}`}
          title={`반복 수입 예정 ${incomeRecurring.length}건: ${incomeRecurring.map((r) => r.name).join(", ")}`}
        >
          <Repeat size={9} className="shrink-0" aria-hidden="true" />
          {incomeRecurring.length}
        </span>
      ),
    });
  }
  if (expenseRecurring.length > 0) {
    badgeItems.push({
      key: "expense-recurring",
      node: (
        <span
          className={`inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-medium px-1 rounded ${transactionTypeBadgeStyle("expense")}`}
          title={`반복 지출 예정 ${expenseRecurring.length}건: ${expenseRecurring.map((r) => r.name).join(", ")}`}
        >
          <Repeat size={9} className="shrink-0" aria-hidden="true" />
          {expenseRecurring.length}
        </span>
      ),
    });
  }
  if (transactions.length > 0) {
    badgeItems.push({
      key: "transactions",
      node: (
        <span
          className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-medium text-gray-400 dark:text-gray-500"
          title={`거래 ${transactions.length}건`}
        >
          <Receipt size={9} className="shrink-0" aria-hidden="true" />
          {transactions.length}
        </span>
      ),
    });
  }
  if (events.length > 0) {
    badgeItems.push({
      key: "events",
      node: (
        <span
          className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-medium px-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
          title={`일정 ${events.length}건: ${events.map((e) => e.title).join(", ")}`}
        >
          <CalendarDays size={9} className="shrink-0" aria-hidden="true" />
          {events.length}
        </span>
      ),
    });
  }
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
      {/* 모바일: 순액 한 줄 + 일정 점 */}
      <div className="flex sm:hidden flex-col items-start gap-0.5 w-full">
        {transactions.length > 0 &&
          (net !== 0 ? (
            <span
              className={`text-[10px] font-semibold truncate w-full ${transactionAmountTextColor(net > 0 ? "income" : "expense")}`}
              title={`수입 ${formatKrw(income)} · 지출 ${formatKrw(expense)}`}
            >
              {net > 0 ? "+" : "-"}
              {formatKrwCompact(Math.abs(net))}
            </span>
          ) : (
            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">거래 {transactions.length}</span>
          ))}
        {hasSchedule && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-blue-500"
            title={`일정·반복 예정 ${events.length + recurringDue.length}건`}
          />
        )}
      </div>

      {/* sm 이상: 수입/지출 금액 + 전체 배지 */}
      {showIncome && (
        <span
          className={`hidden sm:block text-xs font-medium truncate w-full ${transactionAmountTextColor("income")}`}
          title={formatKrw(income)}
        >
          +{formatKrwCompact(income)}
        </span>
      )}
      {showExpense && (
        <span
          className={`hidden sm:block text-xs font-medium truncate w-full ${transactionAmountTextColor("expense")}`}
          title={formatKrw(expense)}
        >
          -{formatKrwCompact(expense)}
        </span>
      )}
      {hasBadgeRow && (
        <div className="hidden sm:flex flex-wrap items-center gap-1 w-full">
          {badgeItems.map((item) => (
            <span key={item.key}>{item.node}</span>
          ))}
        </div>
      )}
    </button>
  );
}

export default memo(LedgerDayCell);
