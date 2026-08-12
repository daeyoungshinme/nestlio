import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import SkeletonCard from "@/components/common/SkeletonCard";
import EmptyState from "@/components/common/EmptyState";
import { fetchNetWorth } from "@/api/netWorth";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw, formatKrwCompact, formatYearMonth } from "@/utils/format";
import { TrendingUp } from "lucide-react";

export default function NetWorthTrendChart() {
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.netWorth, queryFn: () => fetchNetWorth(12) });

  if (isLoading || !data) {
    return <SkeletonCard rows={3} />;
  }

  if (data.history.length < 2) {
    return (
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">순자산 추이</h3>
        <EmptyState icon={TrendingUp} title="추이를 보려면 데이터가 더 필요해요" description="매달 1일 자동으로 순자산이 기록돼요" compact />
      </div>
    );
  }

  const chartData = data.history.map((row) => ({
    name: formatYearMonth(row.year_month),
    순자산: Number(row.net_worth),
  }));

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">순자산 추이</h3>
      <div className="h-[180px] sm:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatKrwCompact(Number(v))} width={70} />
            <Tooltip formatter={(v) => formatKrw(Number(v))} />
            <Area type="monotone" dataKey="순자산" stroke="#2563EB" fill="url(#netWorthFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
