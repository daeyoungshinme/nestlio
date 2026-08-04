import Tabs from "@/components/common/Tabs";
import CashflowPlanTab from "@/components/financialPlan/CashflowPlanTab";
import ChallengesSection from "@/components/financialPlan/ChallengesSection";
import FinancialGoalsSection from "@/components/financialPlan/FinancialGoalsSection";
import { useTabSearchParam } from "@/hooks/useTabSearchParam";

const TABS = ["현금흐름 계획", "재무목표", "챌린지"] as const;

// "예산"은 현금흐름 계획 탭의 각 지출 섹션(고정/변동/비정기) 안에 통합됐다.
// 옛 tab=예산 딥링크(대시보드 인사이트 등)는 useTabSearchParam의 기본값 폴백으로 안전하게 떨어진다.
export default function FinancialPlanPage() {
  const [tab, handleTabChange] = useTabSearchParam(TABS, "현금흐름 계획");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">목표</h1>

      <Tabs tabs={TABS} activeTab={tab} onChange={handleTabChange} variant="pill" />

      {tab === "현금흐름 계획" && <CashflowPlanTab />}
      {tab === "재무목표" && <FinancialGoalsSection />}
      {tab === "챌린지" && <ChallengesSection />}
    </div>
  );
}
