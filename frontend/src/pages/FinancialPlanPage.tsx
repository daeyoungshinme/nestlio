import { useSearchParams } from "react-router-dom";
import Tabs from "@/components/common/Tabs";
import CashflowPlanTab from "@/components/financialPlan/CashflowPlanTab";
import FinancialGoalsSection from "@/components/financialPlan/FinancialGoalsSection";

const TABS = ["현금흐름 계획", "재무목표"] as const;
type Tab = (typeof TABS)[number];

export default function FinancialPlanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "현금흐름 계획";

  const handleTabChange = (next: Tab) => {
    setSearchParams((prev) => {
      prev.set("tab", next);
      return prev;
    }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">목표</h1>

      <Tabs tabs={TABS} activeTab={tab} onChange={handleTabChange} variant="pill" />

      {tab === "현금흐름 계획" && <CashflowPlanTab />}
      {tab === "재무목표" && <FinancialGoalsSection />}
    </div>
  );
}
