import { useSearchParams } from "react-router-dom";
import Tabs from "@/components/common/Tabs";
import AccountsSection from "@/components/accounts/AccountsSection";
import SavingsProductsSection from "@/components/accounts/SavingsProductsSection";
import LoansSection from "@/components/accounts/LoansSection";
import NetWorthTrendChart from "@/components/accounts/NetWorthTrendChart";

const TABS = ["계좌", "저축·투자", "대출"] as const;
type Tab = (typeof TABS)[number];

export default function AccountsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "계좌";

  const handleTabChange = (next: Tab) => {
    setSearchParams((prev) => {
      prev.set("tab", next);
      return prev;
    }, { replace: true });
  };

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
