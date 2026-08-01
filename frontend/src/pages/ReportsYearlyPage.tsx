import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SkeletonCard from "@/components/common/SkeletonCard";
import SummaryCards from "@/components/common/SummaryCards";
import EmptyState from "@/components/common/EmptyState";
import { fetchCategoryTrend, fetchYearlyReport } from "@/api/reports";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw, formatYearMonth } from "@/utils/format";
import { PieChart as PieChartIcon, TrendingUp } from "lucide-react";

const CATEGORY_TREND_MONTHS = 6;

export default function ReportsYearlyPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.yearlyReport(year), queryFn: () => fetchYearlyReport(year) });
  const { data: trend, isLoading: isTrendLoading } = useQuery({
    queryKey: QUERY_KEYS.categoryTrend(CATEGORY_TREND_MONTHS),
    queryFn: () => fetchCategoryTrend(CATEGORY_TREND_MONTHS),
  });

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  const monthlyData = data.monthly.map((row) => ({
    name: `${Number(row.year_month.slice(5))}월`,
    수입: Number(row.income),
    지출: Number(row.expense),
  }));
  const pieData = data.breakdown.map((row) => ({ name: row.name, value: Number(row.amount), color: row.color }));

  const trendData = trend?.months.map((month, i) => {
    const row: Record<string, string | number> = { name: formatYearMonth(month) };
    for (const series of trend.series) {
      row[series.name] = Number(series.amounts[i]);
    }
    return row;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => setYear(data.prev_year)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="이전 해">
          <ChevronLeft size={18} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">{data.year}년 연간 리포트</h1>
        <button onClick={() => setYear(data.next_year)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="다음 해">
          <ChevronRight size={18} />
        </button>
      </div>

      <SummaryCards totals={data.totals} />

      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">월별 수입/지출</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => formatKrw(Number(v))} />
            <Legend />
            <Bar dataKey="수입" fill="#2563EB" radius={[4, 4, 0, 0]} />
            <Bar dataKey="지출" fill="#DC2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">카테고리별 지출</h3>
        {pieData.length === 0 ? (
          <EmptyState icon={PieChartIcon} title="이 해에 지출 내역이 없어요" compact />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatKrw(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">카테고리별 소비 추이 (최근 {CATEGORY_TREND_MONTHS}개월)</h3>
        {isTrendLoading || !trend || !trendData ? (
          <SkeletonCard rows={2} />
        ) : trend.series.length === 0 ? (
          <EmptyState icon={TrendingUp} title="최근 지출 내역이 없어요" compact />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => formatKrw(Number(v))} />
              <Legend />
              {trend.series.map((series) => (
                <Line
                  key={series.category_id ?? "other"}
                  type="monotone"
                  dataKey={series.name}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
