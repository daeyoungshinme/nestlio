import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import LedgerSearchInput from "@/components/transactions/LedgerSearchInput";
import LedgerDayDetail from "@/components/transactions/LedgerDayDetail";
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
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultDateHint(yearMonth: string): string {
  return yearMonth === currentYearMonth() ? currentDateIso() : `${yearMonth}-01`;
}

/** 가계부 — 부부의 거래 기록과 일정을 한 캘린더에서 공유한다. 달력 위의 `?view=내역|일정` 탭이 캘린더 칸
 * 미리보기와 아래 목록을 함께 바꾼다. 날짜를 누르면 아래 목록이 그날 이력(`LedgerDayDetail`)으로 좁혀지고, 같은 날짜를 다시
 * 누르거나 "한 달 전체"로 돌아온다(구 독립 `/schedule` 페이지는 "일정" 보기로 병합됐고, `?date=YYYY-MM-DD`로
 * 들어오면 그 날을 선택한다). */
export default function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const [view, changeView] = useTabParam("view", LEDGER_VIEWS, "내역");
  const [yearMonth, setYearMonth] = useState(() => {
    const d = searchParams.get("date");
    return d && ISO_DATE_RE.test(d) ? d.slice(0, 7) : currentYearMonth();
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [showRecurringSheet, setShowRecurringSheet] = useRecurringDeepLink();
  const debouncedQuery = useDebouncedValue(searchInput.trim(), 300);
  const calendarRef = useRef<HTMLDivElement>(null);
  const dayDetailRef = useRef<HTMLDivElement>(null);

  // 달을 옮기면 고른 날짜는 그 달 밖이 되므로 한 달 전체 목록으로 돌아간다.
  const changeMonth = (next: string) => {
    setYearMonth(next);
    setSelectedDate(null);
  };
  useSwipeMonth(calendarRef, (direction) => {
    setYearMonth((prev) => shiftYearMonth(prev, direction));
    setSelectedDate(null);
  });
  // 칸(LedgerDayCell)이 memo라 렌더마다 새 함수를 넘기면 42칸이 전부 다시 그려진다.
  const toggleDate = useCallback((date: string) => setSelectedDate((prev) => (prev === date ? null : date)), []);

  // 모바일은 캘린더가 화면 대부분을 차지해 아래 상세가 안 보일 수 있다 — 고르면 상세가 보이게 스크롤한다.
  useEffect(() => {
    if (selectedDate) dayDetailRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selectedDate]);

  const categoriesQuery = useCategories();
  const accountsQuery = useAccounts();
  const savingsProductsQuery = useSavingsProducts();
  const { data: me } = useMe();
  const { data: users } = useUsers();

  const month = useLedgerMonth(yearMonth, debouncedQuery);
  const eventActions = useEventActions({ users });
  const txActions = useTransactionActions({
    categories: categoriesQuery.data,
    accounts: accountsQuery.data,
    savingsProducts: savingsProductsQuery.data,
    users,
    currentUserId: me?.id,
  });

  // ?date=YYYY-MM-DD로 들어오면(옛 일정 경로 리다이렉트·알림 딥링크 등) 그 달로 이동해 그 날을 선택하고(아래 날짜
  // 상세) 파라미터를 지운다. 이미 마운트된 상태에서 파라미터만 바뀌어도 맞는 달의 거래를 보이도록 달도 함께 맞춘다.
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

  return (
    <QueryBoundary
      queries={[categoriesQuery, accountsQuery, savingsProductsQuery]}
      errorMessage="가계부 정보를 불러오지 못했습니다."
      loadingFallback={<SkeletonCard rows={5} />}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <MonthPicker yearMonth={yearMonth} onChange={changeMonth} />
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

        <Tabs tabs={LEDGER_VIEWS} activeTab={view} onChange={changeView} variant="pill" fullWidth />

        <div ref={calendarRef}>
          <LedgerCalendar
            yearMonth={yearMonth}
            view={view}
            selectedDate={selectedDate}
            queries={[month.transactionsQuery, month.eventsQuery]}
            transactionsByDate={month.transactionsByDate}
            eventsByDate={month.eventsByDate}
            recurringDueByDate={month.recurringDueByDate}
            onSelectDate={toggleDate}
          />
        </div>

        {selectedDate ? (
          <div ref={dayDetailRef} className="scroll-mt-4 space-y-3">
            {/* 검색어가 걸린 채 날짜를 고르면 상세도 검색 결과만 보인다 — 검색창을 남겨 지울 수 있게 한다. */}
            {view === "내역" && searchInput !== "" && (
              <LedgerSearchInput value={searchInput} onChange={setSearchInput} />
            )}
            <QueryBoundary
              queries={[month.transactionsQuery, month.eventsQuery]}
              compact
              errorMessage="이 날 이력을 불러오지 못했습니다."
              loadingFallback={<SkeletonCard rows={3} />}
            >
              {/* 다른 달로 막 옮겼으면 아직 이전 달 데이터라 "이 날 내역 없음"으로 보인다 — 받을 때까지 스켈레톤. */}
              {() =>
                month.isPlaceholder ? (
                  <SkeletonCard rows={3} />
                ) : (
                  <LedgerDayDetail
                    date={selectedDate}
                    view={view}
                    transactions={month.transactionsByDate.get(selectedDate) ?? []}
                    events={month.eventsByDate.get(selectedDate) ?? []}
                    recurringDue={month.recurringDueByDate.get(selectedDate) ?? []}
                    searchActive={debouncedQuery !== ""}
                    showUser={showUser}
                    users={users}
                    onClear={() => setSelectedDate(null)}
                    onAddTransaction={() => txActions.openCreate(selectedDate)}
                    onEditTransaction={txActions.openEdit}
                    onAddEvent={() => eventActions.openCreate(selectedDate)}
                    onEditEvent={eventActions.openEdit}
                    onDeleteEvent={eventActions.openDelete}
                    onToggleEventComplete={eventActions.toggleComplete}
                  />
                )
              }
            </QueryBoundary>
          </div>
        ) : view === "일정" ? (
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
                  searchActive={debouncedQuery !== ""}
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
          onClick={() =>
            (view === "일정" ? eventActions : txActions).openCreate(selectedDate ?? defaultDateHint(yearMonth))
          }
        />
        {eventActions.modals}

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
