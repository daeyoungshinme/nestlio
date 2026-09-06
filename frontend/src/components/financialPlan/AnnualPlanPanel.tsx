import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AnnualPlanItemForm from "@/components/financialPlan/AnnualPlanItemForm";
import AnnualPlanSectionPanel from "@/components/financialPlan/AnnualPlanSectionPanel";
import GoalPurposeSummary from "@/components/financialPlan/GoalPurposeSummary";
import type { Purpose } from "@/components/financialPlan/GoalPurposeSummary";
import SavingsInvestmentPlanPanel from "@/components/financialPlan/SavingsInvestmentPlanPanel";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import ErrorState from "@/components/common/ErrorState";
import Modal from "@/components/common/Modal";
import SkeletonCard from "@/components/common/SkeletonCard";
import { planViewLink } from "@/constants/routes";
import SummaryCard from "@/components/common/SummaryCard";
import { deleteAnnualPlanItem, fetchAnnualPlan, upsertAnnualPlanItem } from "@/api/annualPlan";
import { fetchSavingsProductsAnnualPlan } from "@/api/savingsProducts";
import { useCategories, useUsers } from "@/hooks/useReferenceData";
import { SECTIONS, SAVINGS_INVESTMENT_LABEL, type SectionLabel } from "@/constants/planSections";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw, pctOf } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { worseStatus } from "@/utils/colors";
import { toast } from "@/utils/toast";
import type { AnnualPlanItemOut, CashflowSection } from "@/types";
import type { AnnualPlanItemFormValues } from "@/components/financialPlan/AnnualPlanItemForm";

const currentYear = () => new Date().getFullYear();

interface ItemModalState {
  section: CashflowSection;
  item: AnnualPlanItemOut | null;
}

/** 현금흐름 계획 탭의 "연간계획" 서브뷰 — 이번 달 계획(CashflowPlanTab)과 완전히 동일한 UI/UX
 * (요약카드 4개 + 클릭형 목적요약 + 섹션 Tabs로 한 번에 하나씩 전환)를 쓴다. 수입/고정지출/
 * 변동지출/비정기지출은 항목을 여러 개 등록하고 항목마다 12개월 목표금액을 입력하는, 월간
 * CashflowPlanTab과 동일한 구조의 연간 버전이다. 저축·투자는 새 항목 개념을 만들지 않고 기존
 * SavingsProduct 데이터를 "올해 누적" 모드로 그대로 재사용하되, 상품마다 적용 시작월~종료월 +
 * 월별 목표금액을 지정할 수 있다(SavingsInvestmentPlanPanel의 ProductRow 참고) — 항목을 새로
 * 만드는 대신 상품 자체에 연도별 계획을 붙이는 방식. 개별 재무목표(목표 탭의 GoalsTab)와는
 * 완전히 별개 개념이다. */
export default function AnnualPlanPanel() {
  const [year, setYear] = useState(currentYear());
  const [activeLabel, setActiveLabel] = useState<SectionLabel>("수입");
  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEYS.annualPlan(year),
    queryFn: () => fetchAnnualPlan(year),
  });
  const { data: savingsAnnualData } = useQuery({
    queryKey: QUERY_KEYS.savingsProductsAnnualPlan(year),
    queryFn: () => fetchSavingsProductsAnnualPlan(year),
  });
  const { data: users } = useUsers();
  const { data: categories } = useCategories();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.annualPlan(year) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
    // "이번 달 계획"은 서브뷰 전환만으로는 언마운트되지 않아 자동으로 다시 fetch되지 않으므로,
    // 연간계획 저장 직후 폴백 항목이 즉시 반영되도록 월과 무관하게 전부 무효화한다.
    void queryClient.invalidateQueries({ queryKey: ["cashflow-plan"] });
  };

  const upsertMutation = useMutation({
    mutationFn: upsertAnnualPlanItem,
    onSuccess: () => {
      invalidate();
      setItemModal(null);
      toast("저장했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAnnualPlanItem,
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast("삭제했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }
  if (isLoading || !data) {
    return <SkeletonCard rows={6} />;
  }

  const summary = data.summary;
  const plannedSavingsInvestmentAnnualTotal = savingsAnnualData
    ? Number(savingsAnnualData.savings.annual_target) + Number(savingsAnnualData.investment.annual_target)
    : 0;
  const savingsInvestmentTargetToDate = savingsAnnualData
    ? Number(savingsAnnualData.savings.target_to_date) + Number(savingsAnnualData.investment.target_to_date)
    : 0;
  const savingsInvestmentActual =
    savingsAnnualData && savingsAnnualData.savings.actual !== null && savingsAnnualData.investment.actual !== null
      ? Number(savingsAnnualData.savings.actual) + Number(savingsAnnualData.investment.actual)
      : null;
  const savingsInvestmentPct = pctOf(savingsInvestmentActual, savingsInvestmentTargetToDate);
  const purposes: Purpose[] = [
    { label: "수입", pct: summary.income.pct, status: summary.income.status },
    { label: "고정지출", pct: summary.fixed.pct, status: summary.fixed.status },
    { label: "변동지출", pct: summary.variable.pct, status: summary.variable.status },
    { label: "비정기지출", pct: summary.irregular.pct, status: summary.irregular.status },
    {
      label: SAVINGS_INVESTMENT_LABEL,
      pct: savingsInvestmentPct,
      status: savingsAnnualData
        ? worseStatus(savingsAnnualData.savings.status, savingsAnnualData.investment.status)
        : null,
    },
  ];

  const handleSubmitItem = (values: AnnualPlanItemFormValues) => {
    if (!itemModal) return;
    const { section, item } = itemModal;
    const sectionCount = data.items.filter((i) => i.section === section).length;
    upsertMutation.mutate({
      id: item?.id ?? null,
      year,
      section,
      owner_user_id: values.owner_user_id || null,
      name: values.name,
      category_id: values.category_id ? Number(values.category_id) : null,
      sort_order: item?.sort_order ?? sectionCount,
      start_month: values.start_month,
      end_month: values.end_month,
      monthly_targets: values.monthly_targets,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{year}년 연간계획</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setYear((y) => y - 1)}>
            이전 해
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setYear((y) => y + 1)}>
            다음 해
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        연간 계획 금액과 올해 지금까지의 실제 내역을 비교해 달성율을 보여줘요. 카테고리를 태깅하면 그 카테고리의
        실제 지출과도 비교돼요. 여기서 입력한 월별 금액은 아직 해당 월에 계획 항목이 없으면 "이번 달 계획"에도
        자동으로 반영돼요.
      </p>
      <Link
        to={planViewLink("목표")}
        className="block text-xs text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-primary-400"
      >
        개별 재무목표의 월별 계획·달성 현황은 목표 탭에서 확인해요 →
      </Link>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="계획 수입 합계" value={formatKrw(summary.income.annual_target)} tone="positive" />
        <SummaryCard label="계획 지출 합계" value={formatKrw(summary.expense_total)} />
        <SummaryCard
          label="저축 가능액 (계획)"
          value={formatKrw(summary.available)}
          tone={Number(summary.available) < 0 ? "negative" : "positive"}
        />
        <SummaryCard
          label="계획된 저축·투자액"
          value={savingsAnnualData ? formatKrw(plannedSavingsInvestmentAnnualTotal) : "…"}
          tone={
            savingsAnnualData && plannedSavingsInvestmentAnnualTotal > Number(summary.available)
              ? "negative"
              : "positive"
          }
        />
      </div>

      <GoalPurposeSummary
        heading="올해 목표 현황 (칩을 눌러 항목별 계획을 편집하세요)"
        purposes={purposes}
        activeLabel={activeLabel}
        onSelect={(label) => setActiveLabel(label as SectionLabel)}
      />

      {activeLabel === SAVINGS_INVESTMENT_LABEL ? (
        <SavingsInvestmentPlanPanel yearMonth={`${year}-01`} initialViewMode="올해 누적" showViewToggle={false} />
      ) : (
        (() => {
          const { key, label } = SECTIONS.find((s) => s.label === activeLabel)!;
          const items = data.items.filter((i) => i.section === key);
          const categoryBudgetRows = data.category_budgets.filter(
            (row) => row.type === key && Number(row.budget) > 0,
          );
          return (
            <AnnualPlanSectionPanel
              sectionKey={key}
              label={label}
              items={items}
              sectionSummary={summary[key]}
              users={users}
              categories={categories ?? []}
              categoryBudgetRows={categoryBudgetRows}
              onAddItem={() => setItemModal({ section: key, item: null })}
              onEditItem={(item) => setItemModal({ section: key, item })}
              onDeleteItem={(item) => setDeleteTarget(item.id)}
            />
          );
        })()
      )}

      {itemModal && (
        <Modal
          onClose={() => setItemModal(null)}
          title={`${SECTIONS.find((s) => s.key === itemModal.section)?.label} 항목 ${itemModal.item ? "수정" : "추가"}`}
        >
          <div className="p-6 overflow-y-auto">
            <AnnualPlanItemForm
              year={year}
              section={itemModal.section}
              users={users}
              categories={categories ?? []}
              initialValues={
                itemModal.item
                  ? {
                      name: itemModal.item.name,
                      owner_user_id: itemModal.item.owner_user_id ?? "",
                      category_id: itemModal.item.category_id !== null ? String(itemModal.item.category_id) : "",
                      start_month: itemModal.item.start_month,
                      end_month: itemModal.item.end_month,
                      monthly_targets: itemModal.item.monthly_targets,
                    }
                  : undefined
              }
              submitLabel={itemModal.item ? "저장" : "추가"}
              submitting={upsertMutation.isPending}
              onSubmit={handleSubmitItem}
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
