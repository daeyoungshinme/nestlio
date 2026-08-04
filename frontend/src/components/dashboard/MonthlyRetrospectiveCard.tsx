import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import SkeletonCard from "@/components/common/SkeletonCard";
import { fetchMonthlyRetrospective } from "@/api/dashboard";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { insightSeverityStyle } from "@/utils/colors";
import { formatKrw, formatYearMonth } from "@/utils/format";

export default function MonthlyRetrospectiveCard() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEYS.monthlyRetrospective,
    queryFn: fetchMonthlyRetrospective,
    staleTime: STALE_TIME.SHORT,
  });

  if (isLoading || !data) {
    return <SkeletonCard rows={2} />;
  }

  const totalSavings = data.by_user.reduce((sum, u) => sum + Math.max(0, Number(u.savings)), 0);

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 min-h-[44px]"
      >
        <div className="text-left">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {formatYearMonth(data.year_month)} 우리 부부 회고
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            함께 {formatKrw(totalSavings)} 모았어요
          </p>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">수입</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{formatKrw(data.totals.income)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">지출</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{formatKrw(data.totals.expense)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">저축</p>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {formatKrw(data.totals.savings)}
              </p>
            </div>
          </div>

          {data.by_user.length > 0 && (
            <div className="space-y-1.5">
              {data.by_user.map((u) => (
                <div key={u.user_id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{u.display_name}</span>
                  <span className="text-gray-500 dark:text-gray-400">{formatKrw(u.savings)} 보탰어요</span>
                </div>
              ))}
            </div>
          )}

          {data.top_categories.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">많이 쓴 카테고리</p>
              <div className="space-y-1">
                {data.top_categories.map((c) => (
                  <div key={c.category_id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: c.color }}
                        aria-hidden="true"
                      />
                      <span className="text-gray-700 dark:text-gray-300 truncate">{c.name}</span>
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 shrink-0">{formatKrw(c.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.insights.length > 0 && (
            <div className="space-y-2">
              {data.insights.map((insight, i) => (
                <div
                  key={i}
                  className={`border rounded-lg px-3 py-2 text-xs ${insightSeverityStyle(insight.severity)}`}
                >
                  {insight.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
