import { useQuery } from "@tanstack/react-query";
import SummaryCard from "@/components/common/SummaryCard";
import SkeletonCard from "@/components/common/SkeletonCard";
import { fetchNetWorth } from "@/api/netWorth";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw } from "@/utils/format";

export default function AccountsSummaryCards() {
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.netWorth, queryFn: () => fetchNetWorth(12) });
  // "저축·투자"/"부동산" 카드 분리용 — 백엔드 savings_total은 real_estate까지 합산된 값이라(app/services/net_worth_service.py),
  // 같은 상품 목록(다른 탭들과 쿼리 키 공유, 추가 네트워크 요청 없음)에서 부동산 몫만 계산해 빼는 방식으로 구한다.
  const { data: products } = useQuery({ queryKey: QUERY_KEYS.savingsProducts, queryFn: fetchSavingsProducts });

  if (isLoading || !data) {
    return <SkeletonCard rows={2} />;
  }

  const { current } = data;
  const netWorth = Number(current.net_worth);
  const realEstateTotal = products?.filter((p) => p.product_type === "real_estate").reduce((sum, p) => sum + Number(p.current_balance), 0) ?? 0;
  const savingsInvestmentTotal = Number(current.savings_total) - realEstateTotal;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <SummaryCard label="계좌" value={formatKrw(current.accounts_total)} />
      <SummaryCard label="저축·투자" value={formatKrw(savingsInvestmentTotal)} />
      <SummaryCard label="부동산" value={formatKrw(realEstateTotal)} />
      <SummaryCard label="대출" value={formatKrw(current.loans_total)} tone="negative" />
      <SummaryCard label="순자산" value={formatKrw(current.net_worth)} tone={netWorth >= 0 ? "positive" : "negative"} />
    </div>
  );
}
