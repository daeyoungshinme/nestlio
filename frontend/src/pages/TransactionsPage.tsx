import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, keepPreviousData } from "@tanstack/react-query";
import { Plus, Repeat, Search, X } from "lucide-react";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import Modal from "@/components/common/Modal";
import MonthPicker from "@/components/common/MonthPicker";
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
import RecurringManageSheet from "@/components/transactions/RecurringManageSheet";
import TransactionFilterBar, {
  type ExpenseTypeFilter,
  type TopFilter,
  type UserFilter,
} from "@/components/transactions/TransactionFilterBar";
import {
  createTransaction,
  deleteTransaction,
  fetchCategoryBreakdown,
  fetchTransactions,
  updateTransaction,
} from "@/api/transactions";
import { fetchEvents } from "@/api/events";
import { useSwipeMonth } from "@/hooks/useSwipeMonth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useInvalidateTransactionRelated } from "@/hooks/useInvalidateTransactionRelated";
import { useAccounts, useCategories, useMe, useSavingsProducts, useUsers } from "@/hooks/useReferenceData";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { INPUT_SM } from "@/constants/inputStyles";
import { currentDateIso, currentYearMonth, monthBounds, occurrenceDate, shiftYearMonth } from "@/utils/date";
import { formatKrw } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { CategoryOut, EventOut, RecurringOut, TransactionOut } from "@/types";

const EMPTY_TRANSACTIONS: TransactionOut[] = [];
const EMPTY_EVENTS: EventOut[] = [];
const EMPTY_RECURRING: RecurringOut[] = [];

function defaultDateHint(yearMonth: string): string {
  return yearMonth === currentYearMonth() ? currentDateIso() : `${yearMonth}-01`;
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
  const [createDate, setCreateDate] = useState(currentDateIso());
  const [deleteTarget, setDeleteTarget] = useState<TransactionOut | null>(null);
  const [showRecurringSheet, setShowRecurringSheet] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedQuery = useDebouncedValue(searchInput.trim(), 300);
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
    // eslint-disable-next-line react/exhaustive-deps
  }, [searchParams]);

  const { date_from, date_to } = monthBounds(yearMonth);

  const {
    data: categories,
    isError: categoriesError,
    error: categoriesErrorObj,
    refetch: refetchCategories,
  } = useCategories();
  const {
    data: accounts,
    isError: accountsError,
    error: accountsErrorObj,
    refetch: refetchAccounts,
  } = useAccounts();
  const {
    data: savingsProducts,
    isError: savingsProductsError,
    error: savingsProductsErrorObj,
    refetch: refetchSavingsProducts,
  } = useSavingsProducts();
  const { data: me } = useMe();
  const { data: users } = useUsers();
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

  const openCreate = (dateHint?: string) => {
    setSelectedDate(null);
    setCreateDate(dateHint ?? defaultDateHint(yearMonth));
    setFormTarget("new");
  };

  const openEdit = (tx: TransactionOut) => {
    setSelectedDate(null);
    setFormTarget(tx);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <MonthPicker yearMonth={yearMonth} onChange={setYearMonth} />
        <div className="flex gap-2">
          <button
            onClick={() => setShowRecurringSheet(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            aria-label="반복 거래 관리"
          >
            <Repeat size={16} aria-hidden="true" />
            <span className="hidden sm:inline">반복 거래</span>
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

      <div className="sticky top-0 z-10 -mx-3 px-3 py-2 space-y-2 bg-gray-50 dark:bg-gray-950">
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

        <TransactionFilterBar
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
        />
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

      {deleteTarget && (
        <ConfirmModal
          message="이 내역을 삭제할까요? 되돌릴 수 없습니다."
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showRecurringSheet && (
        <RecurringManageSheet
          categories={categories}
          dateFrom={date_from}
          dateTo={date_to}
          onClose={() => setShowRecurringSheet(false)}
        />
      )}
    </div>
  );
}
