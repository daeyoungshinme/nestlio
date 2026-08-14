import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import EmptyState from "@/components/common/EmptyState";
import { formatKrw, formatKrwCompact, formatYearMonth } from "@/utils/format";
import { netWorthTrendChartColor } from "@/utils/colors";
import { useThemeStore } from "@/stores/themeStore";
import type { NetWorthSnapshotOut } from "@/types";
import { TrendingUp } from "lucide-react";

interface Props {
  history: NetWorthSnapshotOut[];
}

export default function NetWorthTrendChart({ history }: Props) {
  const isDark = useThemeStore((s) => s.isDark);

  if (history.length < 2) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="추이를 보려면 데이터가 더 필요해요"
        description="매달 1일 자동으로 순자산이 기록돼요"
        compact
      />
    );
  }

  const chartData = history.map((row) => ({
    name: formatYearMonth(row.year_month),
    순자산: Number(row.net_worth),
  }));
  // "2026년 7월" 같은 긴 한글 라벨을 좁은 화면에 다 찍으면 겹치므로, 개수가 많을 때는
  // 최대 6개 정도만 균등 간격으로 남기고 나머지는 건너뛴다.
  const tickInterval = chartData.length > 6 ? Math.ceil(chartData.length / 6) - 1 : 0;
  const lineColor = netWorthTrendChartColor(isDark);

  return (
    <div className="h-[180px] sm:h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={tickInterval} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatKrwCompact(Number(v))} width={70} />
          <Tooltip formatter={(v) => formatKrw(Number(v))} />
          <Area type="monotone" dataKey="순자산" stroke={lineColor} fill="url(#netWorthFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
