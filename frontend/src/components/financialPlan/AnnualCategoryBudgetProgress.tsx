import ProgressBar from "@/components/common/ProgressBar";
import { formatKrw, formatPercent } from "@/utils/format";
import { planStatusBarClass, planStatusTextClass } from "@/utils/colors";
import type { AnnualCategoryBudgetRowOut } from "@/types";

interface Props {
  row: AnnualCategoryBudgetRowOut;
}

/** CategoryBudgetProgress의 연간 버전 — 최근 3개월 평균/다음 달 반영 제안은 연 단위에서 의미가
 * 없어 뺐다. */
export default function AnnualCategoryBudgetProgress({ row }: Props) {
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
          <span className="truncate">{row.name}</span>
        </span>
        <span className={`shrink-0 font-semibold ${planStatusTextClass(row.status)}`}>
          {formatPercent(row.pct)} 사용
        </span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        실제 {formatKrw(row.actual)} / 연간 예산 {formatKrw(row.budget)}
      </p>
      <div className="mt-1">
        <ProgressBar pct={row.pct} barClassName={planStatusBarClass(row.status)} />
      </div>
    </div>
  );
}
