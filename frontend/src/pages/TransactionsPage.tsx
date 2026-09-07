import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Repeat } from "lucide-react";
import ConfirmModal from "@/components/common/ConfirmModal";
import Modal from "@/components/common/Modal";
import MonthPicker from "@/components/common/MonthPicker";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import Button from "@/components/common/Button";
import QuickAddFab from "@/components/common/QuickAddFab";
import LedgerCalendar from "@/components/transactions/LedgerCalendar";
import LedgerListControls from "@/components/transactions/LedgerListControls";
import LedgerResults from "@/components/transactions/LedgerResults";
import LedgerDayModal from "@/components/transactions/LedgerDayModal";
import TransactionForm from "@/components/transactions/TransactionForm";
import RecurringManageSheet from "@/components/transactions/RecurringManageSheet";
import { createTransaction, deleteTransaction, updateTransaction } from "@/api/transactions";
import { useSwipeMonth } from "@/hooks/useSwipeMonth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useInvalidateTransactionRelated } from "@/hooks/useInvalidateTransactionRelated";
import { useLedgerFilters } from "@/hooks/useLedgerFilters";
import { useLedgerMonth } from "@/hooks/useLedgerMonth";
import { useRecurringDeepLink } from "@/hooks/useRecurringDeepLink";
import { useAccounts, useCategories, useMe, useSavingsProducts, useUsers } from "@/hooks/useReferenceData";
import { currentDateIso, currentYearMonth, shiftYearMonth } from "@/utils/date";
import { formatKrw } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { TransactionOut } from "@/types";

function defaultDateHint(yearMonth: string): string {
  return yearMonth === currentYearMonth() ? currentDateIso() : `${yearMonth}-01`;
}

export default function TransactionsPage() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
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

  const month = useLedgerMonth(yearMonth, debouncedQuery);
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

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <QueryBoundary
      queries={[categoriesQuery, accountsQuery, savingsProductsQuery]}
      errorMessage="가계부 정보를 불러오지 못했습니다."
      loadingFallback={<SkeletonCard rows={5} />}
    >
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

        <QuickAddFab onClick={() => openCreate()} />

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
            dateFrom={month.dateFrom}
            dateTo={month.dateTo}
            onClose={() => setShowRecurringSheet(false)}
          />
        )}
      </div>
    </QueryBoundary>
  );
}
