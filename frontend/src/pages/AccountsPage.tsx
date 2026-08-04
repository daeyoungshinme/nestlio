import Tabs from "@/components/common/Tabs";
import AccountsSection from "@/components/accounts/AccountsSection";
import SavingsProductsSection from "@/components/accounts/SavingsProductsSection";
import LoansSection from "@/components/accounts/LoansSection";
import NetWorthTrendChart from "@/components/accounts/NetWorthTrendChart";
import { useTabSearchParam } from "@/hooks/useTabSearchParam";

const TABS = ["계좌", "저축·투자", "대출"] as const;

export default function AccountsPage() {
  const [tab, handleTabChange] = useTabSearchParam(TABS, "계좌");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">자산현황</h1>

      <NetWorthTrendChart />

      <Tabs tabs={TABS} activeTab={tab} onChange={handleTabChange} variant="pill" />

      {tab === "계좌" && <AccountsSection />}
      {tab === "저축·투자" && <SavingsProductsSection />}
      {tab === "대출" && <LoansSection />}
    </div>
  );
}
