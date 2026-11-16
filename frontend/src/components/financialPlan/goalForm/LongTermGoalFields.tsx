import { useState } from "react";
import Button from "@/components/common/Button";
import LongTermBasicsStep from "@/components/financialPlan/goalForm/LongTermBasicsStep";
import LongTermFundingStep from "@/components/financialPlan/goalForm/LongTermFundingStep";
import LongTermPlanStep from "@/components/financialPlan/goalForm/LongTermPlanStep";
import type { LongTermGoalFieldsProps } from "@/components/financialPlan/goalForm/longTermGoalTypes";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { useSavingsProductsPlan } from "@/hooks/usePlanQueries";
import { sumAmounts } from "@/utils/amount";
import { yearMonthOfDate } from "@/utils/date";

/** 장기 목표 폼의 단계 — 한 화면에 모든 입력(기본정보·자금원 3종 체크리스트·월별 계획·제안 계산)을 쌓던 긴 모달을
 * 모바일에서 한 번에 한 가지만 결정하도록 나눴다. */
export const GOAL_STEPS = ["무엇을·언제·얼마", "연동할 자금원", "저축 계획"] as const;

/** 장기 목표 — 3단계(기본 정보 → 연동할 자금원 → 저축 계획). 단계 이동·저장 판정은 GoalFormModal의 submit이 한다. */
export default function LongTermGoalFields(props: LongTermGoalFieldsProps) {
  const { draft, step, setStep, existingGoal, submitLabel, submitting, openedAt } = props;
  const isLastStep = step === GOAL_STEPS.length - 1;
  // 단계를 오가도 유지되도록 여기서 들고 있는다.
  const [currentAge, setCurrentAge] = useState("");
  // 저축·투자 상품이 연동된 목표의 월 저축액은 목표에 입력한 값이 아니라 연동 상품들의 이번 달 계획 합계다
  // (백엔드 goal_progress_service.planned_monthly_for_goal — 계획 원본은 계획 탭의 상품별 월 계획). 폼에서도
  // 그 합계를 보여주고, 수정은 계획 탭으로 안내한다 — 여기 입력한 값은 연동 목표에선 쓰이지 않기 때문.
  const { data: productPlan } = useSavingsProductsPlan(yearMonthOfDate(openedAt), {
    enabled: draft.savings_product_ids.length > 0,
  });
  const linkedPlannedMonthly = productPlan
    ? sumAmounts(
        productPlan.items.filter((item) => draft.savings_product_ids.includes(String(item.id))),
        (item) => item.planned,
      )
    : null;
  return (
    <>
      <ol className="grid grid-cols-3 gap-1" aria-label="목표 설정 단계">
        {GOAL_STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              // 새 목표는 순서대로 진행하고(이름 없이 건너뛰지 않게), 수정할 때는 원하는 단계로 바로 이동한다.
              disabled={existingGoal === null && index > step}
              onClick={() => setStep(index)}
              aria-current={index === step ? "step" : undefined}
              className={`w-full ${TOUCH_TARGET_MIN_HEIGHT} rounded-lg px-1 text-xs font-medium border transition-colors disabled:opacity-50 ${
                index === step
                  ? "border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400"
                  : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
              }`}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>
      {step === 0 && <LongTermBasicsStep {...props} />}
      {step === 1 && <LongTermFundingStep {...props} />}
      {step === 2 && (
        <LongTermPlanStep
          {...props}
          currentAge={currentAge}
          setCurrentAge={setCurrentAge}
          linkedPlannedMonthly={linkedPlannedMonthly}
        />
      )}
      <div className="flex gap-2 mt-2">
        {step > 0 && (
          <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep((current) => current - 1)}>
            이전
          </Button>
        )}
        <Button type="submit" loading={isLastStep && submitting} className="flex-1">
          {isLastStep ? submitLabel : "다음"}
        </Button>
      </div>
    </>
  );
}
