import ProgressBar from "@/components/common/ProgressBar";
import { formatKrw, formatPercent } from "@/utils/format";
import { planStatusBarClass, planStatusTextClass } from "@/utils/colors";
import type {
  AnnualPlanSectionSummaryOut,
  CashflowPlanSectionSummaryOut,
  SavingsProductAnnualPlanGroupOut,
  SavingsProductPlanGroupOut,
} from "@/types";

interface Props {
  label: string;
  summary:
    | CashflowPlanSectionSummaryOut
    | SavingsProductPlanGroupOut
    | SavingsProductAnnualPlanGroupOut
    | AnnualPlanSectionSummaryOut;
}

export default function SectionAchievementBar({ label, summary }: Props) {
  if (summary.actual === null || summary.pct === null || summary.status === null) {
    return null;
  }
  return (
    <div className="mt-2 mb-1">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{label} 실적 {formatKrw(summary.actual)}</span>
        <span className={`font-semibold ${planStatusTextClass(summary.status)}`}>
          {formatPercent(summary.pct)} 달성
        </span>
      </div>
      <div className="mt-1">
        <ProgressBar pct={summary.pct} barClassName={planStatusBarClass(summary.status)} />
      </div>
    </div>
  );
}
