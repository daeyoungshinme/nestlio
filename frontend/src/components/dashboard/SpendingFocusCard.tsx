import { Link } from "react-router-dom";
import ProgressBar from "@/components/common/ProgressBar";
import { insightSeverityStyle } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import { planViewLink } from "@/constants/routes";
import type { CategoryBenchmarkRowOut, OwnerOverspendHighlightOut } from "@/types";

interface Props {
  ownerOverspendHighlights: OwnerOverspendHighlightOut[];
  categoryBenchmarks: CategoryBenchmarkRowOut[];
}

export default function SpendingFocusCard({
  ownerOverspendHighlights: rawOwnerOverspendHighlights,
  categoryBenchmarks: rawCategoryBenchmarks,
}: Props) {
  const ownerOverspendHighlights = rawOwnerOverspendHighlights ?? [];
  const overBenchmark = (rawCategoryBenchmarks ?? []).filter((b) => b.status === "warn");
  if (ownerOverspendHighlights.length === 0 && overBenchmark.length === 0) return null;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">지출 줄이기</span>
        <Link
          to={planViewLink("이번 달")}
          className="text-xs font-semibold text-primary dark:text-primary-400 hover:underline"
        >
          예산 조정하기
        </Link>
      </div>

      {ownerOverspendHighlights.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-400 dark:text-gray-500">최근 3개월 평균보다 늘어난 지출</p>
          {ownerOverspendHighlights.map((h) => (
            <div
              key={`${h.owner_user_id ?? "shared"}-${h.category_name}`}
              className={`rounded-lg px-2.5 py-1.5 text-xs border ${insightSeverityStyle("warning")}`}
            >
              {h.display_name} · {h.category_name} 지출이 최근 3개월 평균보다 {formatKrw(h.delta)} 늘었어요 — 여기부터
              줄이면 저축 여력이 생겨요
            </div>
          ))}
        </div>
      )}

      {overBenchmark.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 dark:text-gray-500">표준 가이드라인보다 높은 지출</p>
          {overBenchmark.map((b) => (
            <div key={b.group}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-300">{b.label}</span>
                <span className="text-amber-600 dark:text-amber-400">
                  소득의 {b.pct.toFixed(0)}% (가이드 {b.benchmark_pct.toFixed(0)}%)
                </span>
              </div>
              <ProgressBar pct={b.pct} barClassName="bg-amber-500" markerPct={b.benchmark_pct} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
