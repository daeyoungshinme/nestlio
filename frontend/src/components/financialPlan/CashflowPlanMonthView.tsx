import { useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Link } from "react-router-dom";
import { Copy } from "lucide-react";
import CashflowPlanMonthOverlays from "@/components/financialPlan/CashflowPlanMonthOverlays";
import CashflowPlanSectionPanel from "@/components/financialPlan/CashflowPlanSectionPanel";
import { useCashflowMonthActions } from "@/components/financialPlan/useCashflowMonthActions";
import PlanBalanceSummary from "@/components/plan/PlanBalanceSummary";
import PlanSectionAccordion, { type PlanSection } from "@/components/plan/PlanSectionAccordion";
import SavingsInvestmentPlanPanel from "@/components/financialPlan/SavingsInvestmentPlanPanel";
import Button from "@/components/common/Button";
import MonthPicker from "@/components/common/MonthPicker";
import AccountActionsMenu from "@/components/common/AccountActionsMenu";
import CollapsibleHint from "@/components/common/CollapsibleHint";
import { useCategories, useUsers } from "@/hooks/useReferenceData";
import { useSwipeMonth } from "@/hooks/useSwipeMonth";
import { SECTIONS, SAVINGS_INVESTMENT_LABEL } from "@/constants/planSections";
import { ROUTES } from "@/constants/routes";
import { shiftYearMonth } from "@/utils/date";
import { formatYearMonth, pctOf } from "@/utils/format";
import { savingsInvestmentActual, savingsInvestmentPlanned } from "@/utils/planTotals";
import { worseStatus } from "@/utils/colors";
import type { CashflowPlanListOut, SavingsProductPlanListOut } from "@/types";

/** 이번 달 계획 본문 — 그 달 계획을 받은 뒤에만 그린다(로딩·실패는 CashflowPlanTab의 QueryBoundary). 상태·뮤테이션은
 * useCashflowMonthActions, 모달은 CashflowPlanMonthOverlays, 섹션 본문은 CashflowPlanSectionPanel. */
export default function CashflowPlanMonthView({
  yearMonth,
  setYearMonth,
  data,
  savingsPlanData,
}: {
  yearMonth: string;
  setYearMonth: Dispatch<SetStateAction<string>>;
  data: CashflowPlanListOut;
  savingsPlanData: SavingsProductPlanListOut | undefined;
}) {
  const swipeRef = useRef<HTMLDivElement>(null);
  useSwipeMonth(swipeRef, (direction) => setYearMonth((prev) => shiftYearMonth(prev, direction)));
  const actions = useCashflowMonthActions(yearMonth, data);

  const { data: users } = useUsers();
  const { data: expenseCategories } = useCategories("expense");
  // 반복거래 등록/가계부 즉시추가 모달은 수입 카테고리도 골라야 하므로 지출 전용인 위 목록과 별도로 전체를 받는다.
  const { data: allCategories } = useCategories();

  const summary = data.summary;
  const plannedSavingsInvestmentTotal = savingsInvestmentPlanned(savingsPlanData);
  const savingsInvestmentActualTotal = savingsInvestmentActual(savingsPlanData);
  const budgetRowByCategory = new Map(data.category_budgets.map((row) => [row.category_id, row]));
  const sections: PlanSection[] = [
    ...SECTIONS.map(({ key, label }) => ({
      label,
      planned: Number(summary[key].planned),
      actual: summary[key].actual !== null ? Number(summary[key].actual) : null,
      pct: summary[key].pct,
      status: summary[key].status,
      content: (
        <CashflowPlanSectionPanel
          sectionKey={key}
          label={label}
          items={data.items.filter((i) => i.section === key)}
          sectionSummary={summary[key]}
          users={users}
          categories={allCategories ?? []}
          budgetRowByCategory={budgetRowByCategory}
          nextYearMonthLabel={actions.nextYearMonthLabel}
          onAddItem={() => actions.openItemModal({ section: key, item: null })}
          onSplit={actions.openSplit}
          onEditItem={(item) => actions.openItemModal({ section: key, item })}
          onDeleteItem={actions.askDelete}
          onLinkRecurring={actions.setRecurringLinkTarget}
          onQuickAdd={actions.setQuickAddTarget}
          onApplyCategorySuggestion={actions.applyCategorySuggestion}
          applyingCategoryId={actions.applyingCategoryId}
          onApplyIncomeSuggestion={actions.applyIncomeSuggestion}
          applyingIncomeSuggestion={actions.applyingIncomeSuggestion}
        />
      ),
    })),
    {
      label: SAVINGS_INVESTMENT_LABEL,
      planned: plannedSavingsInvestmentTotal,
      actual: savingsInvestmentActualTotal,
      pct: pctOf(savingsInvestmentActualTotal, plannedSavingsInvestmentTotal),
      status: savingsPlanData ? worseStatus(savingsPlanData.savings.status, savingsPlanData.investment.status) : null,
      content: <SavingsInvestmentPlanPanel yearMonth={yearMonth} showViewToggle={false} />,
    },
  ];

  return (
    <div ref={swipeRef} className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <MonthPicker yearMonth={yearMonth} onChange={setYearMonth} />
        {/* 계획이 빈 달에만 버튼으로 크게 — 이미 채운 달엔 가끔 쓰는 기능이라 ⋯ 메뉴로 접는다(빠진 항목만 채운다). */}
        {data.items.length === 0 ? (
          <Button variant="secondary" size="sm" icon={<Copy size={14} />} loading={actions.copying} onClick={actions.copyPrevious}>
            전월 계획 복사
          </Button>
        ) : (
          <AccountActionsMenu
            ariaLabel="이번 달 계획 작업"
            items={[
              {
                icon: <Copy size={16} />,
                label: "전월 계획에서 빠진 항목 복사",
                onClick: actions.copyPrevious,
                disabled: actions.copying,
              },
            ]}
          />
        )}
      </div>

      <PlanBalanceSummary
        periodLabel={formatYearMonth(yearMonth)}
        income={Number(summary.income.planned)}
        expense={Number(summary.expense_total)}
        savingsPlanned={savingsPlanData ? plannedSavingsInvestmentTotal : null}
      />

      <PlanSectionAccordion sections={sections} />

      <CollapsibleHint summary="이번 달 계획은 연간계획의 이번 달 금액이에요.">
        여기서 바꾼 금액은 이번 달에만 적용되고, 달마다 다른 금액은 연간 탭에서 한 번에 채울 수 있어요. 실제
        수입·지출은{" "}
        <Link to={ROUTES.transactions} className="font-semibold underline hover:no-underline">
          가계부
        </Link>
        에서 확인해요.
      </CollapsibleHint>

      <CashflowPlanMonthOverlays
        actions={actions}
        yearMonth={yearMonth}
        budgetRows={data.category_budgets}
        users={users}
        expenseCategories={expenseCategories ?? []}
        allCategories={allCategories ?? []}
      />
    </div>
  );
}
