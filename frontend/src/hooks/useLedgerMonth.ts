import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchTransactions } from "@/api/transactions";
import { fetchEvents } from "@/api/events";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { monthBounds, occurrenceDate } from "@/utils/date";
import type { EventOut, RecurringOut, TransactionOut } from "@/types";

const EMPTY_TRANSACTIONS: TransactionOut[] = [];

/** 가계부 한 달치 데이터 계층 — 거래/일정 쿼리와, 캘린더 셀·합계에 쓰는 날짜별 그룹핑을 한곳에 모은다. */
export function useLedgerMonth(yearMonth: string, debouncedQuery: string) {
  const { date_from, date_to } = monthBounds(yearMonth);

  const transactionsQuery = useQuery({
    queryKey: QUERY_KEYS.transactions({ date_from, date_to, q: debouncedQuery || undefined }),
    queryFn: () => fetchTransactions({ date_from, date_to, q: debouncedQuery || undefined }),
    placeholderData: keepPreviousData,
  });

  const eventsQuery = useQuery({
    queryKey: QUERY_KEYS.events(date_from, date_to),
    queryFn: () => fetchEvents(date_from, date_to),
    placeholderData: keepPreviousData,
  });

  const items = transactionsQuery.data?.items ?? EMPTY_TRANSACTIONS;
  const eventData = eventsQuery.data;

  const transactionsByDate = useMemo(() => {
    const map = new Map<string, TransactionOut[]>();
    for (const tx of items) {
      const list = map.get(tx.transaction_date) ?? [];
      list.push(tx);
      map.set(tx.transaction_date, list);
    }
    return map;
  }, [items]);

  const savingsTotal = useMemo(
    () => items.filter((tx) => tx.category.is_savings).reduce((sum, tx) => sum + Number(tx.amount), 0),
    [items],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventOut[]>();
    for (const item of eventData?.items ?? []) {
      const date = occurrenceDate(item.occurrence_start);
      const list = map.get(date) ?? [];
      list.push(item);
      map.set(date, list);
    }
    return map;
  }, [eventData]);

  const recurringDueByDate = useMemo(() => {
    const map = new Map<string, RecurringOut[]>();
    for (const item of eventData?.recurring_due ?? []) {
      const list = map.get(item.next_due_date) ?? [];
      list.push(item);
      map.set(item.next_due_date, list);
    }
    return map;
  }, [eventData]);

  return {
    dateFrom: date_from,
    dateTo: date_to,
    transactionsQuery,
    eventsQuery,
    items,
    totals: transactionsQuery.data?.totals,
    transactionsByDate,
    eventsByDate,
    recurringDueByDate,
    savingsTotal,
  };
}
