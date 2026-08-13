import { useQuery } from "@tanstack/react-query";
import SkeletonCard from "@/components/common/SkeletonCard";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import AssetCompositionDonut from "@/components/accounts/AssetCompositionDonut";
import NetWorthTrendChart from "@/components/accounts/NetWorthTrendChart";
import { fetchNetWorth } from "@/api/netWorth";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { fetchLoans } from "@/api/loans";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw, formatKrwCompact } from "@/utils/format";
import { splitSavingsAndRealEstate } from "@/utils/netWorth";
import { netWorthTextColor } from "@/utils/colors";

export default function AccountsSnapshotCard() {
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.netWorth, queryFn: () => fetchNetWorth(12) });
  // "저축·투자"/"부동산" 카드 분리용 — 같은 상품 목록(다른 탭들과 쿼리 키 공유, 추가 네트워크 요청
  // 없음)에서 부동산 몫만 빼는 계산은 splitSavingsAndRealEstate(utils/netWorth.ts)로 통일한다
  // (DashboardPage의 순자산 카드도 동일 함수를 써서 두 화면 숫자가 항상 일치하도록 보장).
  const { data: products } = useQuery({ queryKey: QUERY_KEYS.savingsProducts, queryFn: fetchSavingsProducts });
  // 도넛의 부동산 조각을 담보대출 순액으로 보여주기 위한 대출 목록(다른 탭들과 쿼리 키 공유,
  // 추가 네트워크 요청 없음) — growlio_account_id로 부동산 자산과 짝지어진 대출만 골라낸다
  // (app/services/real_estate_service.py의 담보대출 연동과 동일한 매칭 방식).
  const { data: loans } = useQuery({ queryKey: QUERY_KEYS.loans, queryFn: fetchLoans });

  if (isLoading || !data) {
    return <SkeletonCard rows={3} />;
  }

  const { current, history } = data;
  const netWorth = Number(current.net_worth);
  const accountsTotal = Number(current.accounts_total);
  const loansTotal = Number(current.loans_total);
  const { savingsInvestmentTotal, realEstateTotal } = splitSavingsAndRealEstate(Number(current.savings_total), products);

  const realEstateGrowlioIds = new Set(
    (products ?? [])
      .filter((p) => p.product_type === "real_estate" && p.growlio_account_id)
      .map((p) => p.growlio_account_id as string),
  );
  const realEstateMortgageTotal = (loans ?? [])
    .filter((loan) => loan.growlio_account_id && realEstateGrowlioIds.has(loan.growlio_account_id))
    .reduce((sum, loan) => sum + Number(loan.balance), 0);
  const realEstateNetTotal = Math.max(realEstateTotal - realEstateMortgageTotal, 0);
  const totalAssetsTotal = netWorth + loansTotal;

  return (
    <div className="space-y-3">
      <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex flex-row items-start gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">순자산</p>
            <p className={`text-xl sm:text-3xl lg:text-4xl font-bold ${netWorthTextColor(netWorth)}`}>
              {formatKrwCompact(netWorth)}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 truncate">{formatKrw(current.net_worth)}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              총자산 {formatKrwCompact(totalAssetsTotal)} − 대출 {formatKrwCompact(loansTotal)} = 순자산{" "}
              {formatKrwCompact(netWorth)}
            </p>
          </div>

          <AssetCompositionDonut
            accounts={accountsTotal}
            savingsInvestment={savingsInvestmentTotal}
            realEstate={realEstateNetTotal}
          />
        </div>
      </div>

      <CollapsibleGroup
        header={<span className="text-sm font-medium text-gray-600 dark:text-gray-400">순자산 추이</span>}
        defaultOpen={false}
      >
        <NetWorthTrendChart history={history} />
      </CollapsibleGroup>
    </div>
  );
}
