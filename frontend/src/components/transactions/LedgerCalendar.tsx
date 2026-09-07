import type { UseQueryResult } from "@tanstack/react-query";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import MonthCalendarGrid from "@/components/transactions/MonthCalendarGrid";
import LedgerDayCell from "@/components/transactions/LedgerDayCell";
import type { EventOut, RecurringOut, TransactionOut } from "@/types";

const EMPTY_TRANSACTIONS: TransactionOut[] = [];
const EMPTY_EVENTS: EventOut[] = [];
const EMPTY_RECURRING: RecurringOut[] = [];

interface Props {
  yearMonth: string;
  queries: UseQueryResult<unknown>[];
  transactionsByDate: Map<string, TransactionOut[]>;
  eventsByDate: Map<string, EventOut[]>;
  recurringDueByDate: Map<string, RecurringOut[]>;
  onSelectDate: (date: string) => void;
}

export default function LedgerCalendar({
  yearMonth,
  queries,
  transactionsByDate,
  eventsByDate,
  recurringDueByDate,
  onSelectDate,
}: Props) {
  return (
    <QueryBoundary
      queries={queries}
      errorMessage="가계부 내역을 불러오지 못했습니다."
      loadingFallback={<SkeletonCard rows={4} />}
    >
      <MonthCalendarGrid
        yearMonth={yearMonth}
        renderCell={(cell) => (
          <LedgerDayCell
            date={cell.date}
            day={cell.day}
            inCurrentMonth={cell.inCurrentMonth}
            isToday={cell.isToday}
            transactions={transactionsByDate.get(cell.date) ?? EMPTY_TRANSACTIONS}
            events={eventsByDate.get(cell.date) ?? EMPTY_EVENTS}
            recurringDue={recurringDueByDate.get(cell.date) ?? EMPTY_RECURRING}
            onSelect={onSelectDate}
          />
        )}
      />
    </QueryBoundary>
  );
}
