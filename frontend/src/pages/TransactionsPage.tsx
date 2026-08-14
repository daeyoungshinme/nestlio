import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarSync,
  Download,
  MoreHorizontal,
  Plus,
  Repeat,
  Search,
  SlidersHorizontal,
  Tag,
  Upload,
  X,
} from "lucide-react";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import Modal from "@/components/common/Modal";
import MonthPicker, { currentYearMonth, shiftYearMonth } from "@/components/common/MonthPicker";
import SkeletonCard from "@/components/common/SkeletonCard";
import Button from "@/components/common/Button";
import QuickAddFab from "@/components/common/QuickAddFab";
import MonthCalendarGrid from "@/components/transactions/MonthCalendarGrid";
import LedgerDayCell from "@/components/transactions/LedgerDayCell";
import LedgerDayModal from "@/components/transactions/LedgerDayModal";
import TransactionForm from "@/components/transactions/TransactionForm";
import DailyTransactionGroups from "@/components/transactions/DailyTransactionGroups";
import ExpenseCategoryGroups from "@/components/transactions/ExpenseCategoryGroups";
import SavingsLinkedTransactionsSection from "@/components/transactions/SavingsLinkedTransactionsSection";
import EventForm, { emptyEventFormValues, eventToFormValues } from "@/components/transactions/EventForm";
import RecurringManageSheet from "@/components/transactions/RecurringManageSheet";
import TransactionFilterSheet, {
  filterSummaryLabel,
  type ExpenseTypeFilter,
  type TopFilter,
  type UserFilter,
} from "@/components/transactions/TransactionFilterSheet";
import { fetchCategories } from "@/api/categories";
import { fetchAccounts } from "@/api/accounts";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { fetchMe, fetchUsers } from "@/api/users";
import {
  createTransaction,
  deleteTransaction,
  fetchCategoryBreakdown,
  fetchTransactions,
  fetchTransactionsCsv,
  updateTransaction,
} from "@/api/transactions";
import { createEvent, deleteEvent, fetchEvents, importGoogleEvents, updateEvent } from "@/api/events";
import { useSwipeMonth } from "@/hooks/useSwipeMonth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useInvalidateTransactionRelated } from "@/hooks/useInvalidateTransactionRelated";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { INPUT_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_COMPACT_MOBILE_ONLY } from "@/constants/uiSizes";
import { formatKrw } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import { triggerBlobDownload } from "@/utils/download";
import type { CategoryOut, EventOut, RecurringOut, TransactionOut } from "@/types";

const EMPTY_TRANSACTIONS: TransactionOut[] = [];
const EMPTY_EVENTS: EventOut[] = [];
const EMPTY_RECURRING: RecurringOut[] = [];

function monthBounds(yearMonth: string): { date_from: string; date_to: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { date_from: `${yearMonth}-01`, date_to: `${yearMonth}-${String(lastDay).padStart(2, "0")}` };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultDateHint(yearMonth: string): string {
  return yearMonth === currentYearMonth() ? todayIso() : `${yearMonth}-01`;
}

function occurrenceDate(iso: string): string {
  return iso.split("T")[0];
}

function matchesFilter(
  tx: TransactionOut,
  topFilter: TopFilter,
  categoryFilter: number | "all",
  expenseTypeFilter: ExpenseTypeFilter,
  userFilter: UserFilter,
): boolean {
  if (userFilter !== "all" && tx.user.id !== userFilter) return false;
  if (topFilter === "savings") return tx.category.is_savings;
  if (topFilter !== "all" && tx.type !== topFilter) return false;
  if (topFilter === "expense" && tx.category.is_savings) return false;
  if (topFilter !== "all" && categoryFilter !== "all" && tx.category.id !== categoryFilter) return false;
  if (topFilter === "expense" && expenseTypeFilter !== "all" && tx.category.type !== expenseTypeFilter) return false;
  return true;
}

export default function TransactionsPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [topFilter, setTopFilter] = useState<TopFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<ExpenseTypeFilter>("all");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<"new" | TransactionOut | null>(null);
  const [createDate, setCreateDate] = useState(todayIso());
  const [deleteTarget, setDeleteTarget] = useState<TransactionOut | null>(null);
  const [eventFormTarget, setEventFormTarget] = useState<"new" | EventOut | null>(null);
  const [eventCreateDate, setEventCreateDate] = useState(todayIso());
  const [eventDeleteTarget, setEventDeleteTarget] = useState<EventOut | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showRecurringSheet, setShowRecurringSheet] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedQuery = useDebouncedValue(searchInput.trim(), 300);
  const queryClient = useQueryClient();
  const calendarRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useSwipeMonth(calendarRef, (direction) => setYearMonth((prev) => shiftYearMonth(prev, direction)));

  // 현금흐름계획 탭의 "반복 거래 규칙 수정하기" 딥링크(?recurring=manage)로 들어오면 반복 내역 관리 시트를 바로 연다.
  useEffect(() => {
    if (searchParams.get("recurring") !== "manage") return;
    setShowRecurringSheet(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("recurring");
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { date_from, date_to } = monthBounds(yearMonth);

  const {
    data: categories,
    isError: categoriesError,
    error: categoriesErrorObj,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: QUERY_KEYS.categories(),
    queryFn: () => fetchCategories(),
    staleTime: STALE_TIME.LONG,
  });
  const {
    data: accounts,
    isError: accountsError,
    error: accountsErrorObj,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: QUERY_KEYS.accounts,
    queryFn: fetchAccounts,
    staleTime: STALE_TIME.LONG,
  });
  const {
    data: savingsProducts,
    isError: savingsProductsError,
    error: savingsProductsErrorObj,
    refetch: refetchSavingsProducts,
  } = useQuery({
    queryKey: QUERY_KEYS.savingsProducts,
    queryFn: fetchSavingsProducts,
    staleTime: STALE_TIME.MEDIUM,
  });
  const { data: me } = useQuery({ queryKey: QUERY_KEYS.me, queryFn: fetchMe, staleTime: STALE_TIME.LONG });
  const { data: users } = useQuery({ queryKey: QUERY_KEYS.users, queryFn: fetchUsers, staleTime: STALE_TIME.LONG });
  const userOptions = useMemo(() => {
    if (!me || !users) return [];
    return [
      { value: "all", label: "전체" },
      ...users.map((u) => ({ value: u.id, label: u.id === me.id ? "나" : u.display_name })),
    ];
  }, [me, users]);
  const {
    data,
    isLoading,
    isError: transactionsError,
    error: transactionsErrorObj,
    refetch: refetchTransactions,
  } = useQuery({
    queryKey: QUERY_KEYS.transactions({ date_from, date_to, q: debouncedQuery || undefined }),
    queryFn: () => fetchTransactions({ date_from, date_to, q: debouncedQuery || undefined }),
    placeholderData: keepPreviousData,
  });
  const showExpenseGroups = topFilter === "expense" && categoryFilter === "all";
  const {
    data: breakdown,
    isLoading: breakdownLoading,
    isError: breakdownError,
    error: breakdownErrorObj,
    refetch: refetchBreakdown,
  } = useQuery({
    queryKey: QUERY_KEYS.categoryBreakdown({ date_from, date_to, type: "expense", user_id: userFilter }),
    queryFn: () =>
      fetchCategoryBreakdown({
        date_from,
        date_to,
        type: "expense",
        user_id: userFilter === "all" ? undefined : userFilter,
      }),
    placeholderData: keepPreviousData,
    enabled: showExpenseGroups,
  });
  const {
    data: eventData,
    isLoading: eventsLoading,
    isError: eventsError,
    error: eventsErrorObj,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: QUERY_KEYS.events(date_from, date_to),
    queryFn: () => fetchEvents(date_from, date_to),
    placeholderData: keepPreviousData,
  });

  const transactionsByDate = useMemo(() => {
    const map = new Map<string, TransactionOut[]>();
    for (const tx of data?.items ?? []) {
      const list = map.get(tx.transaction_date) ?? [];
      list.push(tx);
      map.set(tx.transaction_date, list);
    }
    return map;
  }, [data]);

  const filteredTransactions = useMemo(() => {
    return (data?.items ?? [])
      .filter((tx) => matchesFilter(tx, topFilter, categoryFilter, expenseTypeFilter, userFilter))
      .slice()
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id);
  }, [data, topFilter, categoryFilter, expenseTypeFilter, userFilter]);

  const transactionsByCategory = useMemo(() => {
    const map = new Map<number, TransactionOut[]>();
    for (const tx of filteredTransactions) {
      const list = map.get(tx.category.id) ?? [];
      list.push(tx);
      map.set(tx.category.id, list);
    }
    return map;
  }, [filteredTransactions]);

  const savingsTotal = useMemo(
    () => (data?.items ?? []).filter((tx) => tx.category.is_savings).reduce((sum, tx) => sum + Number(tx.amount), 0),
    [data],
  );

  const categoryOptions = useMemo(() => {
    if (topFilter === "all" || topFilter === "savings") return [];
    const byId = new Map<number, CategoryOut>();
    for (const tx of data?.items ?? []) {
      if (tx.type !== topFilter || tx.category.is_savings) continue;
      if (userFilter !== "all" && tx.user.id !== userFilter) continue;
      byId.set(tx.category.id, tx.category);
    }
    const options = Array.from(byId.values());
    const scoped =
      topFilter === "expense" && expenseTypeFilter !== "all"
        ? options.filter((c) => c.type === expenseTypeFilter)
        : options;
    return scoped.sort((a, b) => a.sort_order - b.sort_order);
  }, [data, topFilter, expenseTypeFilter, userFilter]);

  const expenseGroups = useMemo(() => {
    if (!breakdown) return breakdown;
    return expenseTypeFilter === "all" ? breakdown : breakdown.filter((g) => g.type === expenseTypeFilter);
  }, [breakdown, expenseTypeFilter]);

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

  const invalidateAll = useInvalidateTransactionRelated();

  const invalidateEvents = () => void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.eventsAll });

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: (created) => {
      invalidateAll();
      setFormTarget(null);
      toast("내역을 추가했습니다.", "success", {
        label: "취소",
        onClick: () => deleteMutation.mutate(created.id),
      });
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateTransaction>[1] }) =>
      updateTransaction(id, payload),
    onSuccess: () => {
      invalidateAll();
      setFormTarget(null);
      toast("내역을 수정했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      invalidateAll();
      setDeleteTarget(null);
      toast("내역을 삭제했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const createEventMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      invalidateEvents();
      setEventFormTarget(null);
      toast("일정을 등록했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateEvent>[1] }) =>
      updateEvent(id, payload),
    onSuccess: () => {
      invalidateEvents();
      setEventFormTarget(null);
      toast("일정을 수정했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deleteEventMutation = useMutation({
    mutationFn: ({ id }: { id: number; source: EventOut["source"] }) => deleteEvent(id),
    onSuccess: (_data, variables) => {
      invalidateEvents();
      setEventDeleteTarget(null);
      toast(
        variables.source === "google_import"
          ? "Google 캘린더 일정을 목록에서 숨겼습니다."
          : "일정을 삭제했습니다.",
        "success",
      );
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const exportCsvMutation = useMutation({
    mutationFn: () => fetchTransactionsCsv({ date_from, date_to, q: debouncedQuery || undefined }),
    onSuccess: (blob) => triggerBlobDownload(blob, `transactions_${date_from}_${date_to}.csv`),
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const importGoogleEventsMutation = useMutation({
    mutationFn: () => importGoogleEvents(date_from, date_to),
    onSuccess: (result) => {
      invalidateEvents();
      toast(`구글 캘린더에서 ${result.created + result.updated}건을 가져왔어요.`, "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const openCreate = (dateHint?: string) => {
    setSelectedDate(null);
    setCreateDate(dateHint ?? defaultDateHint(yearMonth));
    setFormTarget("new");
  };

  const openEdit = (tx: TransactionOut) => {
    setSelectedDate(null);
    setFormTarget(tx);
  };

  const openCreateEvent = (dateHint?: string) => {
    setSelectedDate(null);
    setEventCreateDate(dateHint ?? defaultDateHint(yearMonth));
    setEventFormTarget("new");
  };

  const openEditEvent = (event: EventOut) => {
    setSelectedDate(null);
    setEventFormTarget(event);
  };

  if (categoriesError || accountsError || savingsProductsError) {
    return (
      <ErrorState
        message={extractErrorMessage(
          categoriesErrorObj ?? accountsErrorObj ?? savingsProductsErrorObj,
          "가계부 정보를 불러오지 못했습니다.",
        )}
        onRetry={() => {
          void refetchCategories();
          void refetchAccounts();
          void refetchSavingsProducts();
        }}
      />
    );
  }

  if (!categories || !accounts || !savingsProducts) {
    return <SkeletonCard rows={5} />;
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isSavingEvent = createEventMutation.isPending || updateEventMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <MonthPicker yearMonth={yearMonth} onChange={setYearMonth} />
        <div className="flex gap-2">
          <button
            onClick={() => setShowMoreMenu(true)}
            className="p-2 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            aria-label="더보기"
          >
            <MoreHorizontal size={18} />
          </button>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => openCreate()}>
            내역 추가
          </Button>
        </div>
      </div>

      {data && (
        <div className="flex justify-end">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            합계: 수입 {formatKrw(data.totals.income)} · 지출 {formatKrw(data.totals.expense)} · 저축{" "}
            {formatKrw(savingsTotal)}
          </p>
        </div>
      )}

      <div ref={calendarRef}>
        {transactionsError || eventsError ? (
          <ErrorState
            message={extractErrorMessage(transactionsErrorObj ?? eventsErrorObj, "가계부 내역을 불러오지 못했습니다.")}
            onRetry={() => {
              void refetchTransactions();
              void refetchEvents();
            }}
          />
        ) : isLoading || eventsLoading || !data || !eventData ? (
          <SkeletonCard rows={4} />
        ) : (
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
                onSelect={setSelectedDate}
              />
            )}
          />
        )}
      </div>

      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="메모나 카테고리로 검색"
          aria-label="거래 내역 검색"
          className={`${INPUT_SM} w-full pl-9 ${searchInput ? "pr-9" : ""}`}
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => setSearchInput("")}
            aria-label="검색어 지우기"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilterSheet(true)}
          className="flex-1 flex items-center gap-2 min-w-0 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg"
        >
          <SlidersHorizontal size={14} className="shrink-0" aria-hidden="true" />
          <span className="truncate">
            {filterSummaryLabel(topFilter, expenseTypeFilter, categoryFilter, categoryOptions, userFilter, userOptions)}
          </span>
        </button>
        <Link
          to="/categories"
          className={`shrink-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg ${TOUCH_TARGET_COMPACT_MOBILE_ONLY}`}
          aria-label="카테고리 관리"
          title="카테고리 관리"
        >
          <Tag size={16} aria-hidden="true" />
        </Link>
      </div>

      {topFilter === "savings" ? (
        filteredTransactions.length === 0 ? (
          <EmptyState title="해당 조건의 내역이 없어요" compact />
        ) : (
          <SavingsLinkedTransactionsSection
            transactions={filteredTransactions}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            showUser={userOptions.length > 2}
            users={users}
          />
        )
      ) : showExpenseGroups ? (
        breakdownError ? (
          <ErrorState
            message={extractErrorMessage(breakdownErrorObj, "카테고리별 지출을 불러오지 못했습니다.")}
            onRetry={() => void refetchBreakdown()}
            compact
          />
        ) : breakdownLoading || !expenseGroups ? (
          <SkeletonCard rows={3} />
        ) : (
          <ExpenseCategoryGroups
            groups={expenseGroups}
            transactionsByCategory={transactionsByCategory}
            totalExpense={data?.totals.expense ?? "0"}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            showUser={userOptions.length > 2}
            users={users}
          />
        )
      ) : (
        <DailyTransactionGroups
          transactions={filteredTransactions}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
          showUser={userOptions.length > 2}
          users={users}
        />
      )}

      <QuickAddFab onClick={() => openCreate()} />

      {selectedDate && (
        <LedgerDayModal
          date={selectedDate}
          transactions={transactionsByDate.get(selectedDate) ?? []}
          events={eventsByDate.get(selectedDate) ?? []}
          recurringDue={recurringDueByDate.get(selectedDate) ?? []}
          showUser={userOptions.length > 2}
          users={users}
          onClose={() => setSelectedDate(null)}
          onAddTransaction={() => openCreate(selectedDate)}
          onEditTransaction={openEdit}
          onDeleteTransaction={(tx) => {
            setSelectedDate(null);
            setDeleteTarget(tx);
          }}
          onAddEvent={() => openCreateEvent(selectedDate)}
          onEditEvent={openEditEvent}
          onDeleteEvent={(event) => {
            setSelectedDate(null);
            setEventDeleteTarget(event);
          }}
        />
      )}

      {formTarget && (
        <Modal onClose={() => setFormTarget(null)} title={formTarget === "new" ? "내역 추가" : "내역 수정"}>
          <div className="p-6 overflow-y-auto">
            <TransactionForm
              categories={categories}
              accounts={accounts}
              savingsProducts={savingsProducts}
              users={users ?? []}
              currentUserId={me?.id}
              layout="stack"
              isNew={formTarget === "new"}
              submitLabel={formTarget === "new" ? "추가" : "저장"}
              submitting={isSaving}
              initialValues={
                formTarget === "new"
                  ? { transaction_date: createDate }
                  : {
                      amount: formTarget.amount,
                      type: formTarget.type,
                      category_id: String(formTarget.category.id),
                      transaction_date: formTarget.transaction_date,
                      description: formTarget.description ?? "",
                      payment_method: formTarget.payment_method ?? "",
                      account_id: formTarget.account ? String(formTarget.account.id) : "",
                      savings_product_id: formTarget.savings_product_id ? String(formTarget.savings_product_id) : "",
                      owner_user_id: formTarget.owner_user_id ?? "",
                    }
              }
              onSubmit={(payload) =>
                formTarget === "new"
                  ? createMutation.mutate(payload)
                  : updateMutation.mutate({ id: formTarget.id, payload })
              }
            />
          </div>
        </Modal>
      )}

      {eventFormTarget && (
        <Modal onClose={() => setEventFormTarget(null)} title={eventFormTarget === "new" ? "새 일정" : "일정 수정"}>
          <div className="p-6 overflow-y-auto">
            <EventForm
              initialValues={
                eventFormTarget === "new" ? emptyEventFormValues(eventCreateDate) : eventToFormValues(eventFormTarget)
              }
              submitLabel={eventFormTarget === "new" ? "추가" : "저장"}
              submitting={isSavingEvent}
              onSubmit={(payload) =>
                eventFormTarget === "new"
                  ? createEventMutation.mutate(payload)
                  : updateEventMutation.mutate({ id: eventFormTarget.id, payload })
              }
            />
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal
          message="이 내역을 삭제할까요? 되돌릴 수 없습니다."
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {eventDeleteTarget && (
        <ConfirmModal
          message={
            eventDeleteTarget.source === "google_import"
              ? `"${eventDeleteTarget.title}" 일정을 목록에서 숨길까요? Google 캘린더의 원본 일정은 삭제되지 않습니다.`
              : `"${eventDeleteTarget.title}" 일정을 삭제할까요?`
          }
          onConfirm={() =>
            deleteEventMutation.mutate({ id: eventDeleteTarget.id, source: eventDeleteTarget.source })
          }
          onCancel={() => setEventDeleteTarget(null)}
        />
      )}

      {showMoreMenu && (
        <Modal onClose={() => setShowMoreMenu(false)} title="더보기" size="sm" closeOnBackdrop>
          <div className="p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            <Link
              to="/categories"
              onClick={() => setShowMoreMenu(false)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Tag size={18} aria-hidden="true" /> 카테고리 관리
            </Link>
            <button
              onClick={() => {
                setShowMoreMenu(false);
                setShowRecurringSheet(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Repeat size={18} aria-hidden="true" /> 반복 내역 관리
            </button>
            <button
              onClick={() => {
                setShowMoreMenu(false);
                openCreateEvent();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <CalendarDays size={18} aria-hidden="true" /> 새 일정
            </button>
            <button
              onClick={() => {
                setShowMoreMenu(false);
                exportCsvMutation.mutate();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Download size={18} aria-hidden="true" /> CSV 내보내기
            </button>
            <button
              onClick={() => {
                setShowMoreMenu(false);
                importGoogleEventsMutation.mutate();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <CalendarSync size={18} aria-hidden="true" /> 구글 캘린더에서 가져오기
            </button>
            <Link
              to="/transactions/import"
              onClick={() => setShowMoreMenu(false)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Upload size={18} aria-hidden="true" /> CSV 가져오기
            </Link>
          </div>
        </Modal>
      )}

      {showRecurringSheet && (
        <RecurringManageSheet
          categories={categories}
          dateFrom={date_from}
          dateTo={date_to}
          onClose={() => setShowRecurringSheet(false)}
        />
      )}

      {showFilterSheet && (
        <TransactionFilterSheet
          topFilter={topFilter}
          expenseTypeFilter={expenseTypeFilter}
          categoryFilter={categoryFilter}
          categoryOptions={categoryOptions}
          userFilter={userFilter}
          userOptions={userOptions}
          onChangeTopFilter={(value) => {
            setTopFilter(value);
            setCategoryFilter("all");
            setExpenseTypeFilter("all");
          }}
          onChangeExpenseTypeFilter={(value) => {
            setExpenseTypeFilter(value);
            setCategoryFilter("all");
          }}
          onChangeCategoryFilter={setCategoryFilter}
          onChangeUserFilter={(value) => {
            setUserFilter(value);
            setCategoryFilter("all");
          }}
          onClose={() => setShowFilterSheet(false)}
        />
      )}
    </div>
  );
}
