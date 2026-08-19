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
  const targetToDate = "target_to_date" in summary ? summary.target_to_date : null;
  const annualPct = "annual_pct" in summary ? summary.annual_pct : null;
  return (
    <div className="mt-2 mb-1">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          {targetToDate !== null && `지금까지 목표 ${formatKrw(targetToDate)} · `}
          {label} 실적 {formatKrw(summary.actual)}
        </span>
        <span className={`font-semibold ${planStatusTextClass(summary.status)}`}>
          {formatPercent(summary.pct)} 달성
        </span>
      </div>
      <div className="mt-1">
        <ProgressBar pct={summary.pct} barClassName={planStatusBarClass(summary.status)} />
      </div>
      {annualPct !== null && (
        <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">연간 목표 대비 {formatPercent(annualPct)}</p>
      )}
    </div>
  );
}
