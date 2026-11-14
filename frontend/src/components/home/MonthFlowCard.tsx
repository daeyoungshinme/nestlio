import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import ErrorState from "@/components/common/ErrorState";
import ProgressBar from "@/components/common/ProgressBar";
import SkeletonCard from "@/components/common/SkeletonCard";
import { SAVINGS_INVESTMENT_LABEL, SECTIONS } from "@/constants/planSections";
import { planViewLink } from "@/constants/routes";
import { formatKrwCompact, formatPercent, pctOf } from "@/utils/format";
import { savingsInvestmentActual, savingsInvestmentPlanned } from "@/utils/planTotals";
import { planStatusBarClass, planStatusTextClass, worseStatus, type PlanStatus } from "@/utils/colors";
import type { CashflowPlanListOut, SavingsProductPlanListOut } from "@/types";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";

interface Row {
  label: string;
  planned: number;
  actual: number | null;
  pct: number | null;
  status: PlanStatus | null;
}

interface Props {
  plan: CashflowPlanListOut | undefined;
  /** 계획 조회 실패 — 카드를 숨기지 않고 본문 자리에 다시 시도를 보여준다(footer는 계획과 무관하게 남긴다). */
  planError?: boolean;
  onRetryPlan?: () => void;
  savingsPlan: SavingsProductPlanListOut | undefined;
  /** 막대 아래에 붙는 행동 영역 — 홈은 "남은 여유자금 → 저축·투자 기록"(InvestSurplusCard embedded)을 넣는다. */
  footer?: ReactNode;
}

/** 홈의 "이번 달 흐름" 한 장 — 계획 탭의 섹션 아코디언 헤더와 같은 5개 축(수입/고정/변동/비정기/저축·투자)을
 * 미니 막대로 보여주고(제목을 누르면 계획 탭), 아래에 그 결과로 남은 여유자금을 저축·투자로 옮기는 행동을 붙인다.
 * 구 홈의 "이번 달 계획 대비" 카드와 "여유자금" 카드를 합쳤다 — 계획 대비 진행과 남은 돈은 같은 질문의 두 면이다. */
export default function MonthFlowCard({ plan, planError, onRetryPlan, savingsPlan, footer }: Props) {
  return (
    <div className="card space-y-3">
      <Link
        to={planViewLink("이번 달")}
        className={`flex items-center justify-between ${TOUCH_TARGET_MIN_HEIGHT} -my-2 hover:text-primary-600 dark:hover:text-primary-400`}
      >
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">이번 달 흐름</h3>
        <span className="flex items-center gap-0.5 text-xs text-gray-500 dark:text-gray-400">
          계획 보기
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </Link>
      {plan ? (
        <FlowRows plan={plan} savingsPlan={savingsPlan} />
      ) : planError ? (
        <ErrorState compact message="이번 달 계획을 불러오지 못했어요" onRetry={onRetryPlan} />
      ) : (
        <SkeletonCard rows={3} bare />
      )}
      {footer}
    </div>
  );
}

function FlowRows({ plan, savingsPlan }: { plan: CashflowPlanListOut; savingsPlan: SavingsProductPlanListOut | undefined }) {
  const summary = plan.summary;
  const savingsPlanned = savingsInvestmentPlanned(savingsPlan);
  const savingsActual = savingsInvestmentActual(savingsPlan);
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

  return !hasAnyPlan ? (
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
                  <span className="tabular-nums text-gray-600 dark:text-gray-300">
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
      );
}
