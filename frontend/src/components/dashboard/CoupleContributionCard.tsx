import ProgressBar from "@/components/common/ProgressBar";
import { insightSeverityStyle } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import type { OwnerCategoryBreakdownOut, OwnerOverspendHighlightOut, OwnerTotalsOut } from "@/types";

interface Props {
  title: string;
  ownerTotals: OwnerTotalsOut[];
  ownerCategoryBreakdown: OwnerCategoryBreakdownOut[];
  ownerOverspendHighlights: OwnerOverspendHighlightOut[];
  totalOwnerSavings: number;
}

function ownerKey(ownerUserId: string | null): string {
  return ownerUserId ?? "shared";
}

export default function CoupleContributionCard({
  title,
  ownerTotals,
  ownerCategoryBreakdown,
  ownerOverspendHighlights,
  totalOwnerSavings,
}: Props) {
  if (ownerTotals.length === 0) return null;

  const categoriesByOwner = new Map(ownerCategoryBreakdown.map((o) => [ownerKey(o.owner_user_id), o.categories]));
  const highlightsByOwner = new Map(ownerOverspendHighlights.map((h) => [ownerKey(h.owner_user_id), h]));

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">{title}</span>
        <span className="font-bold text-gray-900 dark:text-gray-50">{formatKrw(totalOwnerSavings)}</span>
      </div>
      <div className="space-y-4">
        {ownerTotals.map((o) => {
          const categories = categoriesByOwner.get(ownerKey(o.owner_user_id)) ?? [];
          const highlight = highlightsByOwner.get(ownerKey(o.owner_user_id));
          return (
            <div key={ownerKey(o.owner_user_id)} className="space-y-2">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-900 dark:text-gray-50">{o.display_name}</span>
                  <span className="text-gray-500 dark:text-gray-400">{formatKrw(o.savings)} 보탰어요</span>
                </div>
                <ProgressBar
                  pct={totalOwnerSavings > 0 ? (Math.max(0, Number(o.savings)) / totalOwnerSavings) * 100 : 0}
                />
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 dark:text-gray-500">
                  <span>수입 {formatKrw(o.income)}</span>
                  <span>지출 {formatKrw(o.expense)}</span>
                  {Number(o.savings_investment) > 0 && <span>저축·투자 {formatKrw(o.savings_investment)}</span>}
                </div>
              </div>

              {categories.length > 0 && (
                <div className="pl-0.5 space-y-1">
                  {categories.slice(0, 3).map((c) => (
                    <div key={c.category_id} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="size-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: c.color }}
                          aria-hidden="true"
                        />
                        <span className="text-gray-500 dark:text-gray-400 truncate">{c.name}</span>
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 shrink-0">{formatKrw(c.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {highlight && (
                <div className={`rounded-lg px-2.5 py-1.5 text-xs border ${insightSeverityStyle("warning")}`}>
                  {highlight.category_name} 지출이 최근 3개월 평균보다 {formatKrw(highlight.delta)} 늘었어요 — 여기부터
                  줄이면 저축 여력이 생겨요
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
