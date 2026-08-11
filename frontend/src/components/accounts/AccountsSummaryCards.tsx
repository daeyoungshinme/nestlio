import { useQuery } from "@tanstack/react-query";
import SummaryCard from "@/components/common/SummaryCard";
import SkeletonCard from "@/components/common/SkeletonCard";
import { fetchNetWorth } from "@/api/netWorth";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw } from "@/utils/format";

export default function AccountsSummaryCards() {
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.netWorth, queryFn: () => fetchNetWorth(12) });

  if (isLoading || !data) {
    return <SkeletonCard rows={2} />;
  }

  const { current } = data;
  const netWorth = Number(current.net_worth);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <SummaryCard label="계좌" value={formatKrw(current.accounts_total)} />
      <SummaryCard label="저축·투자" value={formatKrw(current.savings_total)} />
      <SummaryCard label="대출" value={formatKrw(current.loans_total)} tone="negative" />
      <SummaryCard label="순자산" value={formatKrw(current.net_worth)} tone={netWorth >= 0 ? "positive" : "negative"} />
    </div>
  );
}
