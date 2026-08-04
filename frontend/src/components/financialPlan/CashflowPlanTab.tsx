import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import CashflowPlanItemForm from "@/components/financialPlan/CashflowPlanItemForm";
import CashflowPlanSplitForm from "@/components/financialPlan/CashflowPlanSplitForm";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import Modal from "@/components/common/Modal";
import MonthPicker, { currentYearMonth } from "@/components/common/MonthPicker";
import ProgressBar from "@/components/common/ProgressBar";
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
import { copyPreviousMonthBudget, fetchBudgets, upsertBudget } from "@/api/budgets";
import { fetchUsers } from "@/api/users";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { INPUT_SM } from "@/constants/inputStyles";
import { formatKrw, formatPercent, toAmountInputValue } from "@/utils/format";
import { installmentProgressLabel } from "@/utils/installment";
import { extractErrorMessage } from "@/utils/error";
import { planStatusBarClass, planStatusTextClass } from "@/utils/colors";
import { toast } from "@/utils/toast";
import type { CashflowPlanItemOut, CashflowPlanSectionSummaryOut, CashflowSection } from "@/types";
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

function SectionAchievement({ label, summary }: { label: string; summary: CashflowPlanSectionSummaryOut }) {
  if (summary.actual === null || summary.pct === null || summary.status === null) {
    return null;
  }
  return (
    <div className="mt-2 mb-1">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{label} 실적 {formatKrw(summary.actual)}</span>
        <span className={`font-semibold ${planStatusTextClass(summary.status)}`}>
          {formatPercent(summary.pct)} 달성
        </span>
      </div>
      <div className="mt-1">
        <ProgressBar pct={summary.pct} barClassName={planStatusBarClass(summary.status)} />
      </div>
    </div>
  );
}

export default function CashflowPlanTab() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [activeLabel, setActiveLabel] = useState<SectionLabel>("수입");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [budgetEdits, setBudgetEdits] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.cashflowPlan(yearMonth),
    queryFn: () => fetchCashflowPlan(yearMonth),
  });
  const { data: users } = useQuery({ queryKey: QUERY_KEYS.users, queryFn: fetchUsers, staleTime: STALE_TIME.LONG });
  const { data: budgetData } = useQuery({
    queryKey: QUERY_KEYS.budgets(yearMonth),
    queryFn: () => fetchBudgets(yearMonth),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cashflowPlan(yearMonth) });

  const upsertMutation = useMutation({
    mutationFn: upsertCashflowPlanItem,
    onSuccess: () => {
      void invalidate();
      toast("저장했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCashflowPlanItem,
    onSuccess: () => {
      void invalidate();
      setDeleteTarget(null);
      toast("삭제했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const splitMutation = useMutation({
    mutationFn: splitCashflowPlanItem,
    onSuccess: (result) => {
      void invalidate();
      setSplitModalOpen(false);
      toast(`${result.created}개월치 계획으로 나눠 등록했습니다.`, "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const copyMutation = useMutation({
    mutationFn: () => copyPreviousMonthCashflowPlan(yearMonth),
    onSuccess: (result) => {
      void invalidate();
      toast(
        result.copied > 0 ? `전월 계획 ${result.copied}건을 복사했습니다.` : "복사할 전월 계획 항목이 없습니다.",
        "success",
      );
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const invalidateBudgets = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.budgets(yearMonth) });

  const upsertBudgetMutation = useMutation({
    mutationFn: upsertBudget,
    onSuccess: () => {
      void invalidateBudgets();
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const copyBudgetMutation = useMutation({
    mutationFn: () => copyPreviousMonthBudget(yearMonth),
    onSuccess: (result) => {
      void invalidateBudgets();
      toast(
        result.copied > 0 ? `전월 예산 ${result.copied}건을 복사했습니다.` : "복사할 전월 예산이 없습니다.",
        "success",
      );
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const commitBudgetEdit = (categoryId: number) => {
    const raw = budgetEdits[categoryId];
    if (raw === undefined) return;
    setBudgetEdits((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
    const amount = raw.trim() === "" ? "0" : raw;
    upsertBudgetMutation.mutate({ year_month: yearMonth, category_id: categoryId, amount });
  };

  if (isLoading || !data) {
    return <SkeletonCard rows={6} />;
  }

  const summary = data.summary;
  const budgetRows = budgetData?.rows ?? [];

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
        계획 금액과 이번 달 실제 거래를 비교해 달성율을 보여줘요.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="계획 수입 합계" value={formatKrw(summary.income.planned)} tone="positive" />
        <SummaryCard label="계획 지출 합계" value={formatKrw(summary.expense_total)} />
        <SummaryCard
          label="저축 가능액 (계획)"
          value={formatKrw(summary.available)}
          tone={Number(summary.available) < 0 ? "negative" : "positive"}
        />
      </div>

      <Tabs tabs={SECTION_LABELS} activeTab={activeLabel} onChange={setActiveLabel} />

      {(() => {
        const { key, label } = SECTIONS.find((s) => s.label === activeLabel)!;
        const items = data.items.filter((i) => i.section === key);
        const sectionSummary = summary[key];

        return (
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                  계획 {formatKrw(sectionSummary.planned)}
                </span>
                {key === "irregular" && (
                  <button
                    onClick={() => setSplitModalOpen(true)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
                    aria-label="할부로 등록"
                    title="할부로 등록"
                  >
                    <Layers size={16} />
                  </button>
                )}
                <button
                  onClick={() => setModal({ section: key, item: null })}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
                  aria-label={`${label} 항목 추가`}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <SectionAchievement label={label} summary={sectionSummary} />
            <div>
              {items.map((item) => {
                const ownerLabel = item.owner_user_id
                  ? (users?.find((u) => u.id === item.owner_user_id)?.display_name ?? "공통")
                  : "공통";
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
                        {item.name}
                        {item.installment_total !== null && (
                          <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
                            ({item.installment_no}/{item.installment_total})
                          </span>
                        )}
                      </p>
                      {key === "income" && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ownerLabel}</p>
                      )}
                      {key === "irregular" && installmentProgressLabel(item) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {installmentProgressLabel(item)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {formatKrw(item.amount)}
                      </span>
                      <button
                        onClick={() => setModal({ section: key, item })}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
                        aria-label="수정"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                        aria-label="삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">등록된 항목이 없습니다.</p>
              )}
            </div>

            {key !== "income" && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">카테고리별 예산</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Copy size={12} />}
                    loading={copyBudgetMutation.isPending}
                    onClick={() => copyBudgetMutation.mutate()}
                  >
                    전월 예산 복사
                  </Button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                  예산 상한을 입력하면 대시보드 코칭 인사이트가 초과 여부를 알려줘요.
                </p>
                <div className="space-y-3">
                  {budgetRows
                    .filter((row) => row.type === key)
                    .map((row) => {
                      const editing = budgetEdits[row.category_id];
                      return (
                        <div key={row.category_id}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{row.name}</span>
                            <input
                              type="number"
                              min={0}
                              step={1000}
                              className={`w-28 text-right ${INPUT_SM}`}
                              value={editing ?? toAmountInputValue(row.budget)}
                              onChange={(e) =>
                                setBudgetEdits((prev) => ({ ...prev, [row.category_id]: e.target.value }))
                              }
                              onBlur={() => commitBudgetEdit(row.category_id)}
                              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                              aria-label={`${row.name} 예산`}
                            />
                          </div>
                          {Number(row.budget) > 0 && (
                            <>
                              <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                <span>
                                  실제 {formatKrw(row.actual)} / 예산 {formatKrw(row.budget)}
                                </span>
                                <span className={`font-semibold ${planStatusTextClass(row.status)}`}>
                                  {formatPercent(row.pct)} 사용
                                </span>
                              </div>
                              <div className="mt-1">
                                <ProgressBar pct={row.pct} barClassName={planStatusBarClass(row.status)} />
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  {budgetRows.filter((row) => row.type === key).length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">
                      등록된 지출 카테고리가 없습니다.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
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
              initialValues={
                modal.item
                  ? {
                      name: modal.item.name,
                      owner_user_id: modal.item.owner_user_id ?? "",
                      amount: modal.item.amount,
                    }
                  : undefined
              }
              submitLabel={modal.item ? "저장" : "추가"}
              submitting={upsertMutation.isPending}
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
    </div>
  );
}
