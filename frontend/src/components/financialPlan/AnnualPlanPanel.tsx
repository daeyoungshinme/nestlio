import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AnnualPlanItemForm from "@/components/financialPlan/AnnualPlanItemForm";
import AnnualPlanSectionPanel from "@/components/financialPlan/AnnualPlanSectionPanel";
import PlanBalanceSummary from "@/components/plan/PlanBalanceSummary";
import PlanSectionAccordion, { type PlanSection } from "@/components/plan/PlanSectionAccordion";
import PlanYearStartWizard from "@/components/plan/PlanYearStartWizard";
import YearlyReportSection from "@/components/plan/YearlyReportSection";
import SavingsInvestmentPlanPanel from "@/components/financialPlan/SavingsInvestmentPlanPanel";
import ConfirmModal from "@/components/common/ConfirmModal";
import ErrorState from "@/components/common/ErrorState";
import Modal from "@/components/common/Modal";
import SkeletonCard from "@/components/common/SkeletonCard";
import { PLAN_ANALYSIS_SECTION, ROUTES } from "@/constants/routes";
import { TOUCH_TARGET_MIN } from "@/constants/uiSizes";
import { deleteAnnualPlanItem, fetchAnnualPlan, upsertAnnualPlanItem } from "@/api/annualPlan";
import { fetchSavingsProductsAnnualPlan } from "@/api/savingsProducts";
import { useCategories, useUsers } from "@/hooks/useReferenceData";
import { SECTIONS, SAVINGS_INVESTMENT_LABEL } from "@/constants/planSections";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { pctOf } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { worseStatus } from "@/utils/colors";
import { currentYear } from "@/utils/date";
import { toast } from "@/utils/toast";
import type { AnnualPlanItemOut, CashflowSection } from "@/types";
import type { AnnualPlanItemFormValues } from "@/components/financialPlan/AnnualPlanItemForm";


interface ItemModalState {
  section: CashflowSection;
  item: AnnualPlanItemOut | null;
}

/** 계획 탭의 "연간" 보기 — 계획의 원본(연간계획)을 편집한다. 위에서부터 연도 이동, 빈 해면 새해 마법사
 * (PlanYearStartWizard), 수입·지출·저축 균형 요약(PlanBalanceSummary), 섹션 아코디언(PlanSectionAccordion:
 * 수입/고정/변동/비정기는 항목마다 12개월 목표금액, 저축·투자는 SavingsProduct에 붙인 연도별 월 계획 —
 * SavingsInvestmentPlanPanel), 맨 아래 실적 분석(YearlyReportSection, 구 연간리포트)이다. 이번 달 보기
 * (CashflowPlanTab)는 이 계획의 한 달 단면이다. 개별 재무목표(목표 탭)와는 별개 개념이다. */
export default function AnnualPlanPanel() {
  const [year, setYear] = useState(currentYear());
  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const analysisRef = useRef<HTMLElement>(null);
  const scrollToAnalysis = searchParams.get("section") === PLAN_ANALYSIS_SECTION;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEYS.annualPlan(year),
    queryFn: () => fetchAnnualPlan(year),
  });
  const {
    data: savingsAnnualData,
    isLoading: savingsLoading,
    isError: savingsError,
    refetch: refetchSavings,
  } = useQuery({
    queryKey: QUERY_KEYS.savingsProductsAnnualPlan(year),
    queryFn: () => fetchSavingsProductsAnnualPlan(year),
  });
  const { data: users } = useUsers();
  const { data: categories } = useCategories();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.annualPlan(year) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
    // "이번 달 계획"은 연간계획의 한 달 단면이라 연간계획을 저장하면 모든 달 화면이 바뀐다 — 월과 무관하게 전부 무효화한다.
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cashflowPlanAll });
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

  // 구 연간리포트 딥링크(/reports/yearly → ?section=분석)로 들어오면 데이터가 그려진 뒤 실적 분석으로 스크롤한다.
  const loaded = Boolean(data);
  useEffect(() => {
    if (scrollToAnalysis && loaded) analysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollToAnalysis, loaded]);

  if (isError || savingsError) {
    return (
      <ErrorState
        onRetry={() => {
          void refetch();
          void refetchSavings();
        }}
      />
    );
  }
  if (isLoading || savingsLoading || !data) {
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
  const sections: PlanSection[] = [
    ...SECTIONS.map(({ key, label }) => {
      const sectionSummary = summary[key];
      return {
        label,
        planned: Number(sectionSummary.elapsed_months > 0 ? sectionSummary.target_to_date : sectionSummary.annual_target),
        actual: sectionSummary.elapsed_months > 0 ? Number(sectionSummary.actual) : null,
        pct: sectionSummary.pct,
        status: sectionSummary.status,
        content: (
          <AnnualPlanSectionPanel
            sectionKey={key}
            label={label}
            items={data.items.filter((i) => i.section === key)}
            sectionSummary={sectionSummary}
            users={users}
            categories={categories ?? []}
            categoryBudgetRows={data.category_budgets.filter((row) => row.type === key && Number(row.budget) > 0)}
            onAddItem={() => setItemModal({ section: key, item: null })}
            onEditItem={(item) => setItemModal({ section: key, item })}
            onDeleteItem={(item) => setDeleteTarget(item.id)}
          />
        ),
      };
    }),
    {
      label: SAVINGS_INVESTMENT_LABEL,
      planned: savingsInvestmentTargetToDate,
      actual: savingsInvestmentActual,
      pct: savingsInvestmentPct,
      status: savingsAnnualData
        ? worseStatus(savingsAnnualData.savings.status, savingsAnnualData.investment.status)
        : null,
      content: <SavingsInvestmentPlanPanel yearMonth={`${year}-01`} initialViewMode="올해 누적" showViewToggle={false} />,
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
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setYear((y) => y - 1)}
          className={`${TOUCH_TARGET_MIN} flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800`}
          aria-label="이전 해"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-base font-bold text-gray-900 dark:text-gray-50">{year}년 연간계획</span>
        <button
          type="button"
          onClick={() => setYear((y) => y + 1)}
          className={`${TOUCH_TARGET_MIN} flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800`}
          aria-label="다음 해"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {data.items.length === 0 && <PlanYearStartWizard year={year} />}

      <PlanBalanceSummary
        periodLabel={`${year}년`}
        income={Number(summary.income.annual_target)}
        expense={Number(summary.expense_total)}
        savingsPlanned={savingsAnnualData ? plannedSavingsInvestmentAnnualTotal : null}
      />

      <PlanSectionAccordion sections={sections} />

      <p className="text-xs text-gray-400 dark:text-gray-500">
        섹션마다 올해 지금까지의 목표 대비 실적이에요. 여기서 입력한 월별 금액이 곧 "이번 달" 계획이고, 이번 달
        화면에서 조정한 금액도 여기에 그대로 반영돼요. 개별 재무목표 진행은{" "}
        <Link to={ROUTES.goals} className="font-semibold underline hover:no-underline">
          목표 탭
        </Link>
        에서 확인해요.
      </p>

      <section ref={analysisRef} className="space-y-4 scroll-mt-16">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">{year}년 실적 분석</h2>
        <YearlyReportSection year={year} />
      </section>

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
