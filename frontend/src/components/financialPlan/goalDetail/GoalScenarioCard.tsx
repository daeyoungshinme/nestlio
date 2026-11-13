import { useState } from "react";
import { monthsToGoalWithExtra } from "@/utils/goalAcceleration";
import { formatKrw } from "@/utils/format";
import type { FinancialGoalOut } from "@/types";

const SCENARIO_STEP = 50_000;
const SCENARIO_MAX = 1_000_000;

/** "매달 조금 더 모으면?" — 월 추가 저축액 슬라이더로 달성까지 남은 개월이 얼마나 줄어드는지 보여준다(수익 제외).
 * 이미 달성한 목표는 그리지 않는다. */
export default function GoalScenarioCard({ goal }: { goal: FinancialGoalOut }) {
  const [extraMonthly, setExtraMonthly] = useState(0);
  const scenario = monthsToGoalWithExtra(goal.required_amount, goal.current_amount, goal.planned_monthly_amount, extraMonthly);
  if (scenario.baseMonths === 0) return null;
  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">매달 조금 더 모으면?</h2>
      <input
        type="range"
        min={0}
        max={SCENARIO_MAX}
        step={SCENARIO_STEP}
        value={extraMonthly}
        onChange={(e) => setExtraMonthly(Number(e.target.value))}
        className="w-full accent-primary-600"
        aria-label="매달 추가로 모을 금액"
      />
      <p className="text-sm text-gray-700 dark:text-gray-300">
        매달 <strong>{formatKrw(extraMonthly)}</strong> 더 모으면{" "}
        {scenario.newMonths === null ? (
          "월 저축 계획을 먼저 세워주세요."
        ) : scenario.monthsSaved > 0 ? (
          <>
            <strong>{scenario.newMonths}개월</strong> 뒤 달성 — 지금보다 <strong>{scenario.monthsSaved}개월</strong> 빨라져요.
          </>
        ) : (
          <>
            지금 계획으로 <strong>{scenario.newMonths}개월</strong> 뒤 달성해요.
          </>
        )}
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        투자 수익을 빼고 계산한 값이에요. 지출을 줄여 만든 돈을 계획 탭의 저축·투자 계획에 더해보세요.
      </p>
    </div>
  );
}
