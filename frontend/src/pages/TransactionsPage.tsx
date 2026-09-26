import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarSync, Repeat } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { LEDGER_VIEWS, type LedgerView } from "@/constants/routes";
import Tabs from "@/components/common/Tabs";
import LedgerScheduleList from "@/components/transactions/LedgerScheduleList";
import { useEventActions } from "@/hooks/useEventActions";
import ConfirmModal from "@/components/common/ConfirmModal";
import Modal from "@/components/common/Modal";
import MonthPicker from "@/components/common/MonthPicker";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import QuickAddFab from "@/components/common/QuickAddFab";
import LedgerCalendar from "@/components/transactions/LedgerCalendar";
import LedgerListControls from "@/components/transactions/LedgerListControls";
import LedgerResults from "@/components/transactions/LedgerResults";
import LedgerDayModal from "@/components/transactions/LedgerDayModal";
import TransactionForm from "@/components/transactions/TransactionForm";
import RecurringManageSheet from "@/components/transactions/RecurringManageSheet";
import { deleteTransaction, updateTransaction } from "@/api/transactions";
import { useSwipeMonth } from "@/hooks/useSwipeMonth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useCreateTransaction, useInvalidateTransactionRelated } from "@/hooks/useInvalidateTransactionRelated";
import { useLedgerFilters } from "@/hooks/useLedgerFilters";
import { useLedgerMonth } from "@/hooks/useLedgerMonth";
import { useRecurringDeepLink } from "@/hooks/useRecurringDeepLink";
import { useAccounts, useCategories, useMe, useSavingsProducts, useSettings, useUsers } from "@/hooks/useReferenceData";
import { currentDateIso, currentYearMonth, shiftYearMonth } from "@/utils/date";
import { formatKrw } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { TransactionOut } from "@/types";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isLedgerView(value: string | null): value is LedgerView {
  return (LEDGER_VIEWS as readonly string[]).includes(value ?? "");
}

function defaultDateHint(yearMonth: string): string {
  return yearMonth === currentYearMonth() ? currentDateIso() : `${yearMonth}-01`;
}

/** 가계부 — 부부의 거래 기록과 일정을 한 캘린더에서 공유한다. `?view=내역|일정`으로 캘린더 아래 목록만 바뀐다
 * (구 독립 `/schedule` 페이지는 이 "일정" 보기로 병합됐고, `?date=YYYY-MM-DD`로 들어오면 그 날 모달을 연다). */
export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const view: LedgerView = isLedgerView(viewParam) ? viewParam : "내역";
  const [yearMonth, setYearMonth] = useState(() => {
    const d = searchParams.get("date");
    return d && ISO_DATE_RE.test(d) ? d.slice(0, 7) : currentYearMonth();
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<"new" | TransactionOut | null>(null);
  const [createDate, setCreateDate] = useState(currentDateIso());
  const [deleteTarget, setDeleteTarget] = useState<TransactionOut | null>(null);
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
  const { data: settings } = useSettings();

  const month = useLedgerMonth(yearMonth, debouncedQuery);
  const eventActions = useEventActions({ users, dateFrom: month.dateFrom, dateTo: month.dateTo });

  // 홈/알림 등에서 ?date=YYYY-MM-DD로 들어오면 그 날 모달을 열고 파라미터를 지운다.
  useEffect(() => {
    const d = searchParams.get("date");
    if (!d || !ISO_DATE_RE.test(d)) return;
    setSelectedDate(d);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("date");
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react/exhaustive-deps -- setSearchParams는 안정적, searchParams만 관찰
  }, [searchParams]);

  const changeView = (next: LedgerView) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("view", next);
        return params;
      },
      { replace: true },
    );
  const filters = useLedgerFilters(month.items);

  const userOptions = useMemo(() => {
    if (!me || !users) return [];
    return [
      { value: "all", label: "전체" },
      ...users.map((u) => ({ value: u.id, label: u.id === me.id ? "나" : u.display_name })),
    ];
  }, [me, users]);
  const showUser = userOptions.length > 2;

  const invalidateAll = useInvalidateTransactionRelated();

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

  const createMutation = useCreateTransaction((created) => {
    setFormTarget(null);
    toast("내역을 추가했습니다.", "success", {
      label: "취소",
      onClick: () => deleteMutation.mutate(created.id),
    });
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

  const isSaving = createMutation.isPending || updateMutation.isPending;

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
            {view === "일정" && settings?.google_connected && (
              <button
                type="button"
                onClick={eventActions.importGoogle}
                disabled={eventActions.importingGoogle}
                className="flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                aria-label="구글 캘린더에서 가져오기"
              >
                <CalendarSync size={16} aria-hidden="true" />
                <span className="hidden sm:inline">구글 캘린더</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowRecurringSheet(true)}
              className="flex items-center gap-1.5 px-3 min-h-[44px] text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              aria-label="반복 거래 관리"
            >
              <Repeat size={16} aria-hidden="true" />
              <span className="hidden sm:inline">반복 거래</span>
            </button>
          </div>
        </div>

        {month.totals && (
          <div className="flex justify-end">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              합계: 수입 {formatKrw(month.totals.income)} · 지출 {formatKrw(month.totals.expense)} · 저축{" "}
              {formatKrw(month.savingsTotal)}
            </p>
          </div>
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
          <LedgerScheduleList
            events={month.eventsQuery.data?.items ?? []}
            users={users}
            onEdit={eventActions.openEdit}
            onDelete={eventActions.openDelete}
            onToggleComplete={eventActions.toggleComplete}
          />
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
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          </>
        )}

        <QuickAddFab
          onClick={() => (view === "일정" ? eventActions.openCreate(defaultDateHint(yearMonth)) : openCreate())}
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
            onClose={() => setSelectedDate(null)}
            onAddTransaction={() => openCreate(selectedDate)}
            onEditTransaction={openEdit}
            onDeleteTransaction={(tx) => {
              setSelectedDate(null);
              setDeleteTarget(tx);
            }}
            onAddEvent={() => {
              eventActions.openCreate(selectedDate);
              setSelectedDate(null);
            }}
            onEditEvent={(event) => {
              setSelectedDate(null);
              eventActions.openEdit(event);
            }}
            onDeleteEvent={(event) => {
              setSelectedDate(null);
              eventActions.openDelete(event);
            }}
            onToggleEventComplete={eventActions.toggleComplete}
          />
        )}

        {formTarget && (
          <Modal onClose={() => setFormTarget(null)} title={formTarget === "new" ? "내역 추가" : "내역 수정"}>
            <div className="p-6 overflow-y-auto">
              <TransactionForm
                categories={categoriesQuery.data!}
                accounts={accountsQuery.data!}
                savingsProducts={savingsProductsQuery.data!}
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
            categories={categoriesQuery.data!}
            onClose={() => setShowRecurringSheet(false)}
          />
        )}
      </div>
    </QueryBoundary>
  );
}
