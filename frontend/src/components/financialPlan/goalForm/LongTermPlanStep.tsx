import { Link } from "react-router-dom";
import AmountInput from "@/components/common/AmountInput";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import FormInput from "@/components/common/FormInput";
import GoalMonthlyTargetEditor from "@/components/financialPlan/GoalMonthlyTargetEditor";
import ExpectedReturnInput from "@/components/financialPlan/goalForm/ExpectedReturnInput";
import { draftCurrentAmount, previewGoalPlan } from "@/components/financialPlan/goalForm/goalPlanPreview";
import type { LongTermGoalFieldsProps } from "@/components/financialPlan/goalForm/longTermGoalTypes";
import { toYearMonth } from "@/components/financialPlan/goalDraft";
import { FORM_LABEL, FORM_SECTION_LABEL } from "@/constants/inputStyles";
import { planViewLink } from "@/constants/routes";
import { formErrorTextClass } from "@/utils/colors";
import { yearMonthOfDate } from "@/utils/date";
import { formatKrw } from "@/utils/format";

/** 장기 목표 3단계 — 현재 저축액·월별 목표·필요 월 저축액 미리보기·월 저축금액·기대 수익률. */
export default function LongTermPlanStep({
  draft,
  setDraft,
  existingGoal,
  openedAt,
  availableSavingsProducts,
  accounts,
  availableLoans,
  currentAge,
  setCurrentAge,
  linkedPlannedMonthly,
}: LongTermGoalFieldsProps & {
  currentAge: string;
  setCurrentAge: (value: string) => void;
  linkedPlannedMonthly: number | null;
}) {
  const isLinked =
    draft.savings_product_ids.length > 0 || draft.account_ids.length > 0 || draft.loan_ids.length > 0;
  const hasLinkedProducts = draft.savings_product_ids.length > 0;
  const thisMonth = yearMonthOfDate(openedAt);
  // 장기목표의 "현재 진행액" — 연동이면 지금 고른 자금원의 잔액 합(대출 차감), 미연동이면 폼에 입력된 값.
  // 필요 월 저축액 미리보기와 균등분배("필요금액 - 여기까지 모은 금액"을 남은 달에 나누기)의 기준이 된다.
  const currentProgress = draftCurrentAmount(draft, {
    savingsProducts: availableSavingsProducts,
    accounts,
    loans: availableLoans,
  });
  const { monthsRemaining, suggestedMonthly } = previewGoalPlan({
    draft,
    existingGoal,
    openedAt,
    currentAge,
    currentAmount: currentProgress,
  });
  const hasMonthlyPlan = draft.monthly_targets.length > 0;

  return (
    <>
      <p className={FORM_SECTION_LABEL}>저축 계획</p>
      {isLinked ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
          현재 저축액은 연동된 항목들의 잔액 합(대출은 차감)으로 자동 계산돼요.
        </div>
      ) : hasMonthlyPlan ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
          현재 저축액은 아래 월별 계획의 달성액 합계로 자동 계산돼요. 저장한 뒤 목표 카드에서
          매달 저축액을 입력해 채워가세요.
        </div>
      ) : (
        <AmountInput
          label="현재 저축액"
          value={draft.current_amount}
          onChange={(value) => setDraft((d) => ({ ...d, current_amount: value }))}
          className="w-full"
        />
      )}
      {draft.target_date !== "" && (
        <GoalMonthlyTargetEditor
          startMonth={thisMonth}
          endMonth={toYearMonth(draft.target_date)}
          targets={draft.monthly_targets}
          onChange={(monthly_targets) => setDraft((d) => ({ ...d, monthly_targets }))}
          distributeAmount={String(Math.max(0, Number(draft.required_amount) - currentProgress))}
        />
      )}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">필요 저축액 자동 계산</p>
        {draft.target_date === "" && (
          <div className="flex items-end gap-2">
            <FormInput
              label="현재 나이"
              type="number"
              inputMode="numeric"
              value={currentAge}
              onChange={(e) => setCurrentAge(e.target.value)}
              className="w-24"
            />
          </div>
        )}
        {suggestedMonthly !== null && hasLinkedProducts && (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            목표까지 필요한 월 저축액: <span className="font-semibold">{formatKrw(suggestedMonthly)}</span>
          </p>
        )}
        {suggestedMonthly !== null && !hasLinkedProducts && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDraft((d) => ({ ...d, monthly_saving_amount: String(suggestedMonthly) }))}
          >
            제안 적용: 월 {formatKrw(suggestedMonthly)}
          </Button>
        )}
        {monthsRemaining !== null && monthsRemaining <= 0 && (
          <p className={`text-xs ${formErrorTextClass()}`}>목표일(또는 필요한 나이)이 지금보다 이후여야 계산할 수 있어요.</p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">(필요금액 − 현재 저축액) ÷ 남은 개월 · 저장되지 않아요</p>
      </div>
      {hasLinkedProducts ? (
        <div className="space-y-1">
          <p className={FORM_LABEL}>월 저축금액 (연동 상품의 이번 달 계획 합계)</p>
          <p className="text-base font-semibold text-gray-900 dark:text-gray-50">
            {linkedPlannedMonthly !== null ? formatKrw(linkedPlannedMonthly) : "계산 중…"}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            상품별 월 계획은{" "}
            <Link to={planViewLink("이번 달")} className="font-semibold underline hover:no-underline">
              계획 탭
            </Link>
            의 저축·투자에서 바꿔요.
          </p>
        </div>
      ) : (
        <AmountInput
          label="월 저축금액"
          value={draft.monthly_saving_amount}
          onChange={(value) => setDraft((d) => ({ ...d, monthly_saving_amount: value }))}
          className="w-full"
        />
      )}
      {/* 투자로 모을 때만 쓰는 선택 항목이라 접어 둔다(값이 있으면 펼친 채로). */}
      <CollapsibleGroup
        header={<span className="text-sm font-medium text-gray-600 dark:text-gray-300">선택 항목 · 기대 수익률</span>}
        defaultOpen={draft.expected_annual_return_pct !== ""}
      >
        <ExpectedReturnInput
          value={draft.expected_annual_return_pct}
          setDraft={setDraft}
          label="기대 연 수익률 %"
          hint="입력하면 월 복리로 예상 달성월을 계산해요. growlio 투자목표를 불러오면 채워져요."
        />
      </CollapsibleGroup>
    </>
  );
}
