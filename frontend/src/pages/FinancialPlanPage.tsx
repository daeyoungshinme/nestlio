import Tabs from "@/components/common/Tabs";
import CashflowPlanTab from "@/components/financialPlan/CashflowPlanTab";
import FinancialGoalsSection from "@/components/financialPlan/FinancialGoalsSection";
import { useTabSearchParam } from "@/hooks/useTabSearchParam";

const TABS = ["현금흐름 계획", "재무목표"] as const;

// "예산"은 현금흐름 계획 탭의 각 지출 섹션(고정/변동/비정기) 안에 통합됐다.
// "챌린지"는 재무목표와 개념이 겹쳐(둘 다 진행률 바 + 목표/현재 금액) 재무목표 탭 하단의
// 서브섹션으로 흡수됐다(FinancialGoalsSection 참고).
// 옛 tab=예산/챌린지 딥링크는 useTabSearchParam의 기본값 폴백으로 안전하게 떨어진다.
export default function FinancialPlanPage() {
  const [tab, handleTabChange] = useTabSearchParam(TABS, "현금흐름 계획");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">목표</h1>

      <Tabs tabs={TABS} activeTab={tab} onChange={handleTabChange} variant="pill" />

      {tab === "현금흐름 계획" && <CashflowPlanTab />}
      {tab === "재무목표" && <FinancialGoalsSection />}
    </div>
  );
}
