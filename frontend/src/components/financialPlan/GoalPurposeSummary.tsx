import { formatPercent } from "@/utils/format";
import { planStatusBarClass, planStatusTextClass, type PlanStatus } from "@/utils/colors";

export interface Purpose {
  label: string;
  pct: number | null;
  status: PlanStatus | null;
}

interface Props {
  /** "이번 달 목표 현황"(CashflowPlanTab) / "올해 목표 현황"(AnnualPlanPanel)처럼 호출부마다
   * 다른 제목 — 그 외 렌더링은 완전히 동일해서 이 컴포넌트는 순수 표시용이다. */
  heading: string;
  purposes: Purpose[];
  activeLabel: string;
  onSelect: (label: string) => void;
}

/** 5개 목적축(수입/고정지출/변동지출/비정기지출/저축·투자)의 계획 대비 실적(%)을 클릭형
 * 버튼으로 보여주는 요약 — 클릭하면 그 섹션의 상세 탭으로 전환된다. pct/status 계산은
 * 이번 달 계획(CashflowPlanTab)과 연간계획(AnnualPlanPanel)의 데이터 모양이 서로 달라 각
 * 호출부가 직접 계산해 purposes로 넘긴다. */
export default function GoalPurposeSummary({ heading, purposes, activeLabel, onSelect }: Props) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{heading}</h3>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {purposes.map((p) => (
          <button
            key={p.label}
            onClick={() => onSelect(p.label)}
            className={[
              "flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-center transition-colors border",
              activeLabel === p.label
                ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950"
                : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60",
            ].join(" ")}
          >
            <span className="flex items-center gap-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${p.status ? planStatusBarClass(p.status) : "bg-gray-300 dark:bg-gray-600"}`} />
              <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300 truncate">{p.label}</span>
            </span>
            <span className={`text-sm font-semibold ${p.status ? planStatusTextClass(p.status) : "text-gray-400 dark:text-gray-500"}`}>
              {p.pct !== null ? formatPercent(p.pct) : "–"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
