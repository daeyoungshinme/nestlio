import { useState } from "react";
import AnnualPlanPanel from "@/components/financialPlan/AnnualPlanPanel";
import CashflowPlanMonthView from "@/components/financialPlan/CashflowPlanMonthView";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import { currentYearMonth } from "@/utils/date";
import { useCashflowPlan, useSavingsProductsPlan } from "@/hooks/usePlanQueries";

/** 계획 화면 본문. 연간은 AnnualPlanPanel이 자체 쿼리로, 이번 달은 그 달 계획·저축 계획을 받은 뒤 CashflowPlanMonthView가
 * 그린다. 고른 달은 여기서 들고 있어 본문이 다시 그려져도 유지된다. */
export default function CashflowPlanTab({ view }: { view: "monthly" | "annual" }) {
  const [yearMonth, setYearMonth] = useState(currentYearMonth);

  // 연간 보기는 AnnualPlanPanel이 자체 쿼리를 쓴다 — 이 달 쿼리는 월 보기에서만 보낸다.
  const cashflowQuery = useCashflowPlan(yearMonth, { enabled: view === "monthly" });
  const savingsPlanQuery = useSavingsProductsPlan(yearMonth, { enabled: view === "monthly" });

  if (view === "annual") {
    return <AnnualPlanPanel />;
  }

  return (
    <QueryBoundary queries={[cashflowQuery, savingsPlanQuery]} loadingFallback={<SkeletonCard rows={6} />}>
      {() => (
        <CashflowPlanMonthView
          yearMonth={yearMonth}
          setYearMonth={setYearMonth}
          data={cashflowQuery.data!}
          savingsPlanData={savingsPlanQuery.data}
        />
      )}
    </QueryBoundary>
  );
}
