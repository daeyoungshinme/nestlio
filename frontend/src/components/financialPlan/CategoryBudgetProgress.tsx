import ProgressBar from "@/components/common/ProgressBar";
import SuggestionHint from "@/components/financialPlan/SuggestionHint";
import { formatKrw, formatPercent } from "@/utils/format";
import { planStatusBarClass, planStatusTextClass } from "@/utils/colors";
import type { BudgetRowOut } from "@/types";

interface Props {
  row: BudgetRowOut;
  nextYearMonthLabel?: string;
  onApplySuggestion?: (row: BudgetRowOut) => void;
  applyingCategoryId?: number | null;
}

export default function CategoryBudgetProgress({ row, nextYearMonthLabel, onApplySuggestion, applyingCategoryId }: Props) {
  const showSuggestion =
    row.status !== "ok" && row.suggested_amount !== null && Number(row.suggested_amount) !== Number(row.budget);

  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5 min-w-0">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: row.color }}
          />
          <span className="truncate">{row.name}</span>
        </span>
        <span className={`shrink-0 font-semibold ${planStatusTextClass(row.status)}`}>
          {formatPercent(row.pct)} 사용
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        실제 {formatKrw(row.actual)} / 예산 {formatKrw(row.budget)}
      </p>
      <div className="mt-1">
        <ProgressBar pct={row.pct} barClassName={planStatusBarClass(row.status)} />
      </div>
      {showSuggestion && (
        <SuggestionHint
          className="mt-1.5"
          actionLabel="다음 달에 반영"
          applying={applyingCategoryId === row.category_id}
          onApply={onApplySuggestion && (() => onApplySuggestion(row))}
        >
          최근 3개월 평균은 {formatKrw(row.suggested_amount!)}이에요.
          {nextYearMonthLabel ? ` ${nextYearMonthLabel} 예산에 반영해볼까요?` : ""}
        </SuggestionHint>
      )}
    </div>
  );
}
