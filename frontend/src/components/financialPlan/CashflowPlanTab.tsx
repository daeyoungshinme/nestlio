import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import CashflowPlanItemForm from "@/components/financialPlan/CashflowPlanItemForm";
import CashflowPlanQuickAddModal from "@/components/financialPlan/CashflowPlanQuickAddModal";
import CashflowPlanRecurringLinkModal from "@/components/financialPlan/CashflowPlanRecurringLinkModal";
import CashflowPlanSectionPanel from "@/components/financialPlan/CashflowPlanSectionPanel";
import CashflowPlanSplitForm from "@/components/financialPlan/CashflowPlanSplitForm";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import Modal from "@/components/common/Modal";
import MonthPicker, { currentYearMonth } from "@/components/common/MonthPicker";
import SkeletonCard from "@/components/common/SkeletonCard";
import SummaryCard from "@/components/common/SummaryCard";
import Tabs from "@/components/common/Tabs";
import {
  copyPreviousMonthCashflowPlan,
  deleteCashflowPlanItem,
  fetchCashflowPlan,
  splitCashflowPlanItem,
  upsertCashflowPlanItem,
} from "@/api/cashflowPlan";
import { fetchBudgets } from "@/api/budgets";
import { fetchCategories } from "@/api/categories";
import { fetchUsers } from "@/api/users";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { formatKrw } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { CashflowPlanItemOut, CashflowSection } from "@/types";
import type { CashflowPlanItemFormValues } from "@/components/financialPlan/CashflowPlanItemForm";
import type { CashflowPlanSplitFormValues } from "@/components/financialPlan/CashflowPlanSplitForm";

const SECTIONS = [
  { key: "income", label: "수입" },
  { key: "fixed", label: "고정지출" },
  { key: "variable", label: "변동지출" },
  { key: "irregular", label: "비정기지출" },
] as const satisfies { key: CashflowSection; label: string }[];

type SectionLabel = (typeof SECTIONS)[number]["label"];
const SECTION_LABELS = SECTIONS.map((s) => s.label) as SectionLabel[];

interface ModalState {
  section: CashflowSection;
  item: CashflowPlanItemOut | null;
}

export default function CashflowPlanTab() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [activeLabel, setActiveLabel] = useState<SectionLabel>("수입");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [recurringLinkTarget, setRecurringLinkTarget] = useState<CashflowPlanItemOut | null>(null);
  const [quickAddTarget, setQuickAddTarget] = useState<CashflowPlanItemOut | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.cashflowPlan(yearMonth),
    queryFn: () => fetchCashflowPlan(yearMonth),
  });
  const { data: users } = useQuery({ queryKey: QUERY_KEYS.users, queryFn: fetchUsers, staleTime: STALE_TIME.LONG });
  const { data: categories } = useQuery({
    queryKey: QUERY_KEYS.categories("expense"),
    queryFn: () => fetchCategories("expense"),
    staleTime: STALE_TIME.LONG,
  });
  // 반복거래 등록/가계부 즉시추가 모달은 수입 카테고리도 골라야 하므로 지출 전용인 위 categories와 별도로 전체를 받는다.
  const { data: allCategories } = useQuery({
    queryKey: QUERY_KEYS.categoriesAll,
    queryFn: () => fetchCategories(),
    staleTime: STALE_TIME.LONG,
  });
  const { data: budgetData } = useQuery({
    queryKey: QUERY_KEYS.budgets(yearMonth),
    queryFn: () => fetchBudgets(yearMonth),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cashflowPlan(yearMonth) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.budgets(yearMonth) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
  };

  const upsertMutation = useMutation({
    mutationFn: upsertCashflowPlanItem,
    onSuccess: () => {
      invalidate();
      toast("저장했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCashflowPlanItem,
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast("삭제했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const splitMutation = useMutation({
    mutationFn: splitCashflowPlanItem,
    onSuccess: (result) => {
      invalidate();
      setSplitModalOpen(false);
      toast(`${result.created}개월치 계획으로 나눠 등록했습니다.`, "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const copyMutation = useMutation({
    mutationFn: () => copyPreviousMonthCashflowPlan(yearMonth),
    onSuccess: (result) => {
      invalidate();
      toast(
        result.copied > 0 ? `전월 계획 ${result.copied}건을 복사했습니다.` : "복사할 전월 계획 항목이 없습니다.",
        "success",
      );
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (isLoading || !data) {
    return <SkeletonCard rows={6} />;
  }

  const summary = data.summary;
  const budgetRows = budgetData?.rows ?? [];
  const budgetRowByCategory = new Map(budgetRows.map((row) => [row.category_id, row]));

  const categoryPlannedTotals: Record<number, string> = Object.fromEntries(
    budgetRows.map((row) => {
      const editingSameCategory = modal?.item?.category_id === row.category_id;
      const adjusted = editingSameCategory
        ? (Number(row.budget) - Number(modal!.item!.amount)).toString()
        : row.budget;
      return [row.category_id, adjusted];
    }),
  );

  const handleSubmitItem = (values: CashflowPlanItemFormValues) => {
    if (!modal) return;
    const { section, item } = modal;
    const sectionCount = data.items.filter((i) => i.section === section).length;
    upsertMutation.mutate(
      {
        id: item?.id ?? null,
        section,
        year_month: yearMonth,
        owner_user_id: values.owner_user_id || null,
        name: values.name,
        amount: values.amount,
        category_id: values.category_id ? Number(values.category_id) : null,
        sort_order: item?.sort_order ?? sectionCount,
      },
      { onSuccess: () => setModal(null) },
    );
  };

  const handleSubmitSplit = (values: CashflowPlanSplitFormValues) => {
    splitMutation.mutate({
      section: "irregular",
      owner_user_id: null,
      name: values.name,
      total_amount: values.total_amount,
      start_year_month: values.start_year_month,
      category_id: values.category_id ? Number(values.category_id) : null,
      sort_order: data.items.filter((i) => i.section === "irregular").length,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <MonthPicker yearMonth={yearMonth} onChange={setYearMonth} />
        <Button
          variant="secondary"
          size="sm"
          icon={<Copy size={14} />}
          loading={copyMutation.isPending}
          onClick={() => copyMutation.mutate()}
        >
          전월 계획 복사
        </Button>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        계획 금액과 이번 달 실제 내역을 비교해 달성율을 보여줘요. 카테고리를 태깅하면 그 카테고리의 실제 지출과도
        비교돼요.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard label="계획 수입 합계" value={formatKrw(summary.income.planned)} tone="positive" />
        <SummaryCard label="계획 지출 합계" value={formatKrw(summary.expense_total)} />
        <SummaryCard
          label="저축 가능액 (계획)"
          value={formatKrw(summary.available)}
          tone={Number(summary.available) < 0 ? "negative" : "positive"}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <Tabs tabs={SECTION_LABELS} activeTab={activeLabel} onChange={setActiveLabel} />

      {(() => {
        const { key, label } = SECTIONS.find((s) => s.label === activeLabel)!;
        return (
          <CashflowPlanSectionPanel
            sectionKey={key}
            label={label}
            items={data.items.filter((i) => i.section === key)}
            sectionSummary={summary[key]}
            users={users}
            budgetRowByCategory={budgetRowByCategory}
            onAddItem={() => setModal({ section: key, item: null })}
            onSplit={() => setSplitModalOpen(true)}
            onEditItem={(item) => setModal({ section: key, item })}
            onDeleteItem={(item) => setDeleteTarget(item.id)}
            onLinkRecurring={setRecurringLinkTarget}
            onQuickAdd={setQuickAddTarget}
          />
        );
      })()}

      {modal && (
        <Modal
          onClose={() => setModal(null)}
          title={`${SECTIONS.find((s) => s.key === modal.section)?.label} 항목 ${modal.item ? "수정" : "추가"}`}
        >
          <div className="p-6 overflow-y-auto">
            <CashflowPlanItemForm
              section={modal.section}
              users={users}
              categories={categories ?? []}
              categoryPlannedTotals={categoryPlannedTotals}
              initialValues={
                modal.item
                  ? {
                      name: modal.item.name,
                      owner_user_id: modal.item.owner_user_id ?? "",
                      amount: modal.item.amount,
                      category_id: modal.item.category_id !== null ? String(modal.item.category_id) : "",
                    }
                  : undefined
              }
              submitLabel={modal.item ? "저장" : "추가"}
              submitting={upsertMutation.isPending}
              isRecurringLinked={modal.item?.recurring_expense_id != null}
              onSubmit={handleSubmitItem}
            />
          </div>
        </Modal>
      )}

      {splitModalOpen && (
        <Modal onClose={() => setSplitModalOpen(false)} title="비정기지출 할부 등록">
          <div className="p-6 overflow-y-auto">
            <CashflowPlanSplitForm
              defaultStartYearMonth={yearMonth}
              categories={categories ?? []}
              submitting={splitMutation.isPending}
              onSubmit={handleSubmitSplit}
            />
          </div>
        </Modal>
      )}

      {deleteTarget !== null && (
        <ConfirmModal
          message="이 항목을 삭제할까요?"
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {recurringLinkTarget && (
        <CashflowPlanRecurringLinkModal
          item={recurringLinkTarget}
          categories={allCategories ?? []}
          onClose={() => setRecurringLinkTarget(null)}
          onLinked={invalidate}
        />
      )}

      {quickAddTarget && (
        <CashflowPlanQuickAddModal
          item={quickAddTarget}
          categories={allCategories ?? []}
          onClose={() => setQuickAddTarget(null)}
          onAdded={invalidate}
        />
      )}
    </div>
  );
}
