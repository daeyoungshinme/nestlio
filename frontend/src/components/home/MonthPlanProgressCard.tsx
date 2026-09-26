import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import ProgressBar from "@/components/common/ProgressBar";
import { SAVINGS_INVESTMENT_LABEL, SECTIONS } from "@/constants/planSections";
import { planViewLink } from "@/constants/routes";
import { formatKrwCompact, formatPercent, pctOf } from "@/utils/format";
import { planStatusBarClass, planStatusTextClass, worseStatus, type PlanStatus } from "@/utils/colors";
import type { CashflowPlanListOut, SavingsProductPlanListOut } from "@/types";

interface Row {
  label: string;
  planned: number;
  actual: number | null;
  pct: number | null;
  status: PlanStatus | null;
}

interface Props {
  plan: CashflowPlanListOut | undefined;
  savingsPlan: SavingsProductPlanListOut | undefined;
}

/** 홈의 "이번 달 계획 대비" 한 장 — 계획 탭의 섹션 아코디언 헤더와 같은 5개 축(수입/고정/변동/비정기/저축·투자)을
 * 미니 막대로만 보여주고, 누르면 계획 탭으로 간다. 구 대시보드의 요약카드(수입/지출/저축 합계 + 펼치면
 * 고정/변동/비정기, "계획 대비 %" 배지)를 대체한다 — 같은 숫자를 계획 탭과 다른 모양으로 두 번 보여주지 않기 위함. */
export default function MonthPlanProgressCard({ plan, savingsPlan }: Props) {
  if (!plan) return null;
  const summary = plan.summary;
  const savingsPlanned = savingsPlan ? Number(savingsPlan.savings.planned) + Number(savingsPlan.investment.planned) : 0;
  const savingsActual = savingsPlan ? Number(savingsPlan.savings.actual ?? 0) + Number(savingsPlan.investment.actual ?? 0) : null;
  const rows: Row[] = [
    ...SECTIONS.map(({ key, label }) => ({
      label,
      planned: Number(summary[key].planned),
      actual: summary[key].actual !== null ? Number(summary[key].actual) : null,
      pct: summary[key].pct,
      status: summary[key].status,
    })),
    {
      label: SAVINGS_INVESTMENT_LABEL,
      planned: savingsPlanned,
      actual: savingsActual,
      pct: pctOf(savingsActual, savingsPlanned),
      status: savingsPlan ? worseStatus(savingsPlan.savings.status, savingsPlan.investment.status) : null,
    },
  ];
  const hasAnyPlan = rows.some((row) => row.planned > 0);

  return (
    <Link to={planViewLink("이번 달")} className="card block hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">이번 달 계획 대비</h3>
        <ChevronRight size={16} className="text-gray-300 dark:text-gray-600" aria-hidden="true" />
      </div>
      {!hasAnyPlan ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          아직 이번 달 계획이 없어요. 계획 탭에서 수입·지출·저축 계획을 세워보세요.
        </p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-300">{row.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-gray-400 dark:text-gray-500">
                    {row.actual !== null ? `${formatKrwCompact(row.actual)} / ` : ""}
                    {formatKrwCompact(row.planned)}
                  </span>
                  <span
                    className={`w-10 text-right font-semibold ${row.status ? planStatusTextClass(row.status) : "text-gray-400 dark:text-gray-500"}`}
                  >
                    {row.pct !== null ? formatPercent(row.pct) : "–"}
                  </span>
                </span>
              </div>
              {row.pct !== null && (
                <div className="mt-1">
                  <ProgressBar pct={row.pct} barClassName={row.status ? planStatusBarClass(row.status) : undefined} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
