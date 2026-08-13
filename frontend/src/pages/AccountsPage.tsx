import { useQuery } from "@tanstack/react-query";
import Tabs from "@/components/common/Tabs";
import AccountsSection from "@/components/accounts/AccountsSection";
import AccountsSnapshotCard from "@/components/accounts/AccountsSnapshotCard";
import SavingsProductsSection from "@/components/accounts/SavingsProductsSection";
import RealEstateSection from "@/components/accounts/RealEstateSection";
import LoansSection from "@/components/accounts/LoansSection";
import { useTabSearchParam } from "@/hooks/useTabSearchParam";
import { fetchUsers } from "@/api/users";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";

const TABS = ["계좌", "저축·투자", "부동산", "대출"] as const;

export default function AccountsPage() {
  const [tab, handleTabChange] = useTabSearchParam(TABS, "계좌");
  const { data: users } = useQuery({ queryKey: QUERY_KEYS.users, queryFn: fetchUsers, staleTime: STALE_TIME.LONG });

  return (
    <div className="space-y-6">
      <AccountsSnapshotCard />

      <Tabs tabs={TABS} activeTab={tab} onChange={handleTabChange} variant="pill" />

      {tab === "계좌" && <AccountsSection users={users} />}
      {tab === "저축·투자" && <SavingsProductsSection users={users} />}
      {tab === "부동산" && <RealEstateSection users={users} />}
      {tab === "대출" && <LoansSection users={users} />}
    </div>
  );
}
