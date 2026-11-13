import { useMemo, useRef, useState } from "react";
import { Repeat } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { LEDGER_VIEWS } from "@/constants/routes";
import { useTabParam } from "@/hooks/useTabParam";
import Tabs from "@/components/common/Tabs";
import LedgerScheduleList from "@/components/transactions/LedgerScheduleList";
import { useEventActions } from "@/hooks/useEventActions";
import InlineStatsBar from "@/components/common/InlineStatsBar";
import MonthPicker from "@/components/common/MonthPicker";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import QuickAddFab from "@/components/common/QuickAddFab";
import LedgerCalendar from "@/components/transactions/LedgerCalendar";
import LedgerListControls from "@/components/transactions/LedgerListControls";
import LedgerResults from "@/components/transactions/LedgerResults";
import LedgerDayModal from "@/components/transactions/LedgerDayModal";
import RecurringManageSheet from "@/components/transactions/RecurringManageSheet";
import { useSwipeMonth } from "@/hooks/useSwipeMonth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useLedgerFilters } from "@/hooks/useLedgerFilters";
import { useLedgerMonth } from "@/hooks/useLedgerMonth";
import { useConsumeSearchParam } from "@/hooks/useConsumeSearchParam";
import { useRecurringDeepLink } from "@/hooks/useRecurringDeepLink";
import { useTransactionActions } from "@/hooks/useTransactionActions";
import { useAccounts, useCategories, useMe, useSavingsProducts, useUsers } from "@/hooks/useReferenceData";
import { currentDateIso, currentYearMonth, shiftYearMonth } from "@/utils/date";
import { formatKrwCompact } from "@/utils/format";
import type { EventOut, TransactionOut } from "@/types";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 날짜 시트 안에서 띄운 폼 — 거래 또는 일정의 추가("new")/수정. */
type DayPanel = { kind: "tx"; target: "new" | TransactionOut } | { kind: "event"; target: "new" | EventOut };

function defaultDateHint(yearMonth: string): string {
  return yearMonth === currentYearMonth() ? currentDateIso() : `${yearMonth}-01`;
}

/** 가계부 — 부부의 거래 기록과 일정을 한 캘린더에서 공유한다. `?view=내역|일정`으로 캘린더 아래 목록만 바뀐다
 * (구 독립 `/schedule` 페이지는 이 "일정" 보기로 병합됐고, `?date=YYYY-MM-DD`로 들어오면 그 날 모달을 연다). */
export default function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const [view, changeView] = useTabParam("view", LEDGER_VIEWS, "내역");
  const [yearMonth, setYearMonth] = useState(() => {
    const d = searchParams.get("date");
    return d && ISO_DATE_RE.test(d) ? d.slice(0, 7) : currentYearMonth();
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayPanel, setDayPanel] = useState<DayPanel | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [showRecurringSheet, setShowRecurringSheet] = useRecurringDeepLink();
  const debouncedQuery = useDebouncedValue(searchInput.trim(), 300);
  const calendarRef = useRef<HTMLDivElement>(null);

  useSwipeMonth(calendarRef, (direction) => setYearMonth((prev) => shiftYearMonth(prev, direction)));

  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();
  const savingsProductsQuery = useSavingsProducts();
  const { data: me } = useMe();
  const { data: users } = useUsers();

  const month = useLedgerMonth(yearMonth, debouncedQuery);
  const eventActions = useEventActions({ users, onSaved: () => setDayPanel(null) });
  const txActions = useTransactionActions({
    categories: categoriesQuery.data,
    accounts: accountsQuery.data,
    savingsProducts: savingsProductsQuery.data,
    users,
    currentUserId: me?.id,
    onSaved: () => setDayPanel(null),
  });

  // ?date=YYYY-MM-DD로 들어오면(옛 일정 경로 리다이렉트 등) 그 달로 이동해 그 날 모달을 열고 파라미터를
  // 지운다. 이미 마운트된 상태에서 파라미터만 바뀌어도 맞는 달의 거래를 보이도록 달도 함께 맞춘다.
  useConsumeSearchParam("date", (d) => {
    if (!ISO_DATE_RE.test(d)) return;
    setYearMonth(d.slice(0, 7));
    setSelectedDate(d);
  });

  const filters = useLedgerFilters(month.items);

  const userOptions = useMemo(() => {
    if (!me || !users) return [];
    return [
      { value: "all", label: "전체" },
      ...users.map((u) => ({ value: u.id, label: u.id === me.id ? "나" : u.display_name })),
    ];
  }, [me, users]);
  const showUser = userOptions.length > 2;

  const closeDay = () => {
    setSelectedDate(null);
    setDayPanel(null);
  };

  const dayPanelView =
    selectedDate && dayPanel
      ? dayPanel.kind === "tx"
        ? {
            title: dayPanel.target === "new" ? "내역 추가" : "내역 수정",
            content: txActions.renderForm(dayPanel.target, selectedDate),
          }
        : {
            title: dayPanel.target === "new" ? "새 일정" : "일정 수정",
            content: eventActions.renderForm(dayPanel.target, selectedDate),
          }
      : null;

  return (
    <QueryBoundary
      queries={[categoriesQuery, accountsQuery, savingsProductsQuery]}
      errorMessage="가계부 정보를 불러오지 못했습니다."
      loadingFallback={<SkeletonCard rows={5} />}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <MonthPicker yearMonth={yearMonth} onChange={setYearMonth} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowRecurringSheet(true)}
              className={`flex items-center gap-1.5 px-3 ${TOUCH_TARGET_MIN_HEIGHT} text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors`}
            >
              <Repeat size={16} aria-hidden="true" />
              {/* 월급·고정비 자동 기록의 유일한 진입점이라 모바일에서도 글자로 보인다(아이콘만으로는 찾기 어려움). */}
              반복 거래
            </button>
          </div>
        </div>

        {month.totals && (
          <InlineStatsBar
            columns={3}
            items={[
              { label: "수입", value: formatKrwCompact(Number(month.totals.income)), tone: "positive" },
              { label: "지출", value: formatKrwCompact(Number(month.totals.expense)), tone: "negative" },
              { label: "저축", value: formatKrwCompact(Number(month.savingsTotal)) },
            ]}
          />
        )}

        <div ref={calendarRef}>
          <LedgerCalendar
            yearMonth={yearMonth}
            queries={[month.transactionsQuery, month.eventsQuery]}
            transactionsByDate={month.transactionsByDate}
            eventsByDate={month.eventsByDate}
            recurringDueByDate={month.recurringDueByDate}
            onSelectDate={setSelectedDate}
          />
        </div>

        <Tabs tabs={LEDGER_VIEWS} activeTab={view} onChange={changeView} variant="pill" fullWidth />

        {view === "일정" ? (
          // 목록은 쿼리별로 경계를 둔다 — 실패를 "일정 없음"으로 보이지 않게(캘린더는 둘 다 있어야 그린다).
          <QueryBoundary
            query={month.eventsQuery}
            compact
            errorMessage="일정을 불러오지 못했습니다."
            loadingFallback={<SkeletonCard rows={3} />}
          >
            {(events) => (
              <LedgerScheduleList
                events={events.items}
                users={users}
                onEdit={eventActions.openEdit}
                onDelete={eventActions.openDelete}
                onToggleComplete={eventActions.toggleComplete}
              />
            )}
          </QueryBoundary>
        ) : (
          <>
            <LedgerListControls
              searchInput={searchInput}
              onSearchChange={setSearchInput}
              topFilter={filters.topFilter}
              expenseTypeFilter={filters.expenseTypeFilter}
              categoryFilter={filters.categoryFilter}
              categoryOptions={filters.categoryOptions}
              userFilter={filters.userFilter}
              userOptions={userOptions}
              onChangeTopFilter={filters.onChangeTopFilter}
              onChangeExpenseTypeFilter={filters.onChangeExpenseTypeFilter}
              onChangeCategoryFilter={filters.onChangeCategoryFilter}
              onChangeUserFilter={filters.onChangeUserFilter}
            />

            <QueryBoundary
              query={month.transactionsQuery}
              compact
              errorMessage="내역을 불러오지 못했습니다."
              loadingFallback={<SkeletonCard rows={4} />}
            >
              {() => (
                <LedgerResults
                  dateFrom={month.dateFrom}
                  dateTo={month.dateTo}
                  topFilter={filters.topFilter}
                  expenseTypeFilter={filters.expenseTypeFilter}
                  userFilter={filters.userFilter}
                  showExpenseGroups={filters.showExpenseGroups}
                  filteredTransactions={filters.filteredTransactions}
                  transactionsByCategory={filters.transactionsByCategory}
                  totalExpense={month.totals?.expense ?? "0"}
                  users={users}
                  showUser={showUser}
                  onEdit={txActions.openEdit}
                  onResetFilters={
                    filters.isFiltered || searchInput
                      ? () => {
                          filters.resetFilters();
                          setSearchInput("");
                        }
                      : undefined
                  }
                />
              )}
            </QueryBoundary>
          </>
        )}

        <QuickAddFab
          onClick={() => (view === "일정" ? eventActions : txActions).openCreate(defaultDateHint(yearMonth))}
        />
        {eventActions.modals}

        {selectedDate && (
          <LedgerDayModal
            date={selectedDate}
            transactions={month.transactionsByDate.get(selectedDate) ?? []}
            events={month.eventsByDate.get(selectedDate) ?? []}
            recurringDue={month.recurringDueByDate.get(selectedDate) ?? []}
            showUser={showUser}
            users={users}
            panel={dayPanelView}
            onBack={() => setDayPanel(null)}
            onClose={closeDay}
            onAddTransaction={() => setDayPanel({ kind: "tx", target: "new" })}
            onEditTransaction={(tx) => setDayPanel({ kind: "tx", target: tx })}
            onAddEvent={() => setDayPanel({ kind: "event", target: "new" })}
            onEditEvent={(event) => setDayPanel({ kind: "event", target: event })}
            onDeleteEvent={eventActions.openDelete}
            onToggleEventComplete={eventActions.toggleComplete}
          />
        )}

        {txActions.modals}

        {showRecurringSheet && (
          <RecurringManageSheet
            categories={categoriesQuery.data!}
            onClose={() => setShowRecurringSheet(false)}
          />
        )}
      </div>
    </QueryBoundary>
  );
}
