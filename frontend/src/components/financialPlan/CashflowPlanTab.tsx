import { useState } from "react";
import AnnualPlanPanel from "@/components/financialPlan/AnnualPlanPanel";
import CashflowPlanMonthView from "@/components/financialPlan/CashflowPlanMonthView";
import MonthPicker from "@/components/common/MonthPicker";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import { currentYearMonth } from "@/utils/date";
import { useCashflowPlan, useSavingsProductsPlan } from "@/hooks/usePlanQueries";

/** 계획 화면 본문. 연간은 AnnualPlanPanel이 자체 쿼리로, 이번 달은 그 달 계획·저축 계획을 받은 뒤 CashflowPlanMonthView가
 * 그린다. 고른 달은 여기서 들고 있어 본문이 다시 그려져도 유지된다. */
export default function CashflowPlanTab({ view }: { view: "monthly" | "annual" }) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth);

  // 연간 보기는 AnnualPlanPanel이 자체 쿼리를 쓴다 — 이 달 쿼리는 월 보기에서만 보낸다.
  // 달을 옮기는 동안 이전 달을 그대로 두어(keepPrevious) 전체 스켈레톤·펼친 섹션 접힘·월 선택기 사라짐을 막는다.
  const cashflowQuery = useCashflowPlan(yearMonth, { enabled: view === "monthly", keepPrevious: true });
  const savingsPlanQuery = useSavingsProductsPlan(yearMonth, { enabled: view === "monthly", keepPrevious: true });
  const switching = cashflowQuery.isPlaceholderData || savingsPlanQuery.isPlaceholderData;
  // 월 선택기는 본문(CashflowPlanMonthView) 안에 있다 — 그 달을 못 불러오면 다른 달로 돌아갈 수 있게 따로 남긴다.
  const failed = cashflowQuery.isError || savingsPlanQuery.isError;

  if (view === "annual") {
    return <AnnualPlanPanel />;
  }

  return (
    <div className="space-y-4">
      {failed && <MonthPicker yearMonth={yearMonth} onChange={setYearMonth} />}
      <QueryBoundary queries={[cashflowQuery, savingsPlanQuery]} loadingFallback={<SkeletonCard rows={6} />}>
        {() => (
          <div className={switching ? "opacity-60 transition-opacity" : undefined} aria-busy={switching}>
            <CashflowPlanMonthView
              yearMonth={yearMonth}
              setYearMonth={setYearMonth}
              data={cashflowQuery.data!}
              savingsPlanData={savingsPlanQuery.data}
            />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
