import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import AmountInput from "@/components/common/AmountInput";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import FormInput from "@/components/common/FormInput";
import FundingSourceChecklist from "@/components/financialPlan/FundingSourceChecklist";
import GoalMonthlyTargetEditor from "@/components/financialPlan/GoalMonthlyTargetEditor";
import ExpectedReturnInput from "@/components/financialPlan/goalForm/ExpectedReturnInput";
import {
  toggleDraftId,
  useGrowlioGoalImport,
  type GoalFieldsProps,
} from "@/components/financialPlan/goalForm/goalFormShared";
import { draftCurrentAmount, previewGoalPlan } from "@/components/financialPlan/goalForm/goalPlanPreview";
import { toYearMonth } from "@/components/financialPlan/goalDraft";
import { FORM_LABEL, FORM_SECTION_LABEL } from "@/constants/inputStyles";
import { planViewLink } from "@/constants/routes";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { useSavingsProductsPlan } from "@/hooks/usePlanQueries";
import type { AccountWithBalanceOut, FinancialGoalOut, LoanOut, SavingsProductOut } from "@/types";
import { sumAmounts } from "@/utils/amount";
import { amountToneClass, formErrorTextClass } from "@/utils/colors";
import { currentDateIso, yearMonthOfDate } from "@/utils/date";
import { formatKrw } from "@/utils/format";
import { syncTargetsToPeriod } from "@/utils/monthRange";

/** 장기 목표 폼의 단계 — 한 화면에 모든 입력(기본정보·자금원 3종 체크리스트·월별 계획·제안 계산)을 쌓던 긴 모달을
 * 모바일에서 한 번에 한 가지만 결정하도록 나눴다. */
export const GOAL_STEPS = ["무엇을·언제·얼마", "연동할 자금원", "저축 계획"] as const;

type LongTermGoalFieldsProps = GoalFieldsProps & {
  step: number;
  setStep: Dispatch<SetStateAction<number>>;
  existingGoal: FinancialGoalOut | null;
  availableSavingsProducts: SavingsProductOut[];
  accounts: AccountWithBalanceOut[];
  availableLoans: LoanOut[];
  /** 모달이 열린 시점 — 렌더 중 new Date()는 비순수 호출이라(oxlint) 모달이 한 번만 잡아 넘긴다. */
  openedAt: Date;
};

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
      {step === 0 && <BasicsStep {...props} />}
      {step === 1 && <FundingStep {...props} />}
      {step === 2 && (
        <PlanStep
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

function BasicsStep({ draft, setDraft, existingGoal, availableSavingsProducts }: LongTermGoalFieldsProps) {
  const growlioGoalMutation = useGrowlioGoalImport(availableSavingsProducts, setDraft);
  return (
    <>
      <p className={FORM_SECTION_LABEL}>기본 정보</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={<Download size={14} />}
        loading={growlioGoalMutation.isPending}
        onClick={() => growlioGoalMutation.mutate()}
      >
        {existingGoal === null ? "growlio 투자목표 불러오기" : "growlio 값으로 채우기"}
      </Button>
      <FormInput
        label="재무목표"
        value={draft.name}
        maxLength={100}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        className="w-full"
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <FormInput
          label="순위"
          type="number"
          inputMode="numeric"
          value={draft.priority}
          onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
          className="w-full"
        />
        <FormInput
          label="목표일"
          type="date"
          value={draft.target_date}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              target_date: e.target.value,
              // 목표일이 바뀌면 월별 목표금액 행도 그 기간에 맞춰 다시 맞춘다 — 겹치는 달의 금액은 보존.
              monthly_targets:
                e.target.value === ""
                  ? []
                  : syncTargetsToPeriod(toYearMonth(currentDateIso()), toYearMonth(e.target.value), d.monthly_targets),
            }))
          }
          className="w-full"
        />
      </div>
      {draft.target_date === "" && (
        <FormInput
          label="목표 나이"
          hint="목표일 대신 나이로 정할 때"
          type="number"
          inputMode="numeric"
          value={draft.target_age}
          onChange={(e) => setDraft((d) => ({ ...d, target_age: e.target.value }))}
          className="w-full"
        />
      )}
      <AmountInput
        label="필요금액"
        value={draft.required_amount}
        onChange={(value) => setDraft((d) => ({ ...d, required_amount: value }))}
        className="w-full"
      />
    </>
  );
}

function FundingStep({ draft, setDraft, availableSavingsProducts, accounts, availableLoans }: LongTermGoalFieldsProps) {
  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        상품·계좌를 연결하면 저축액이 자동 계산돼요. 연결하지 않아도 돼요.
      </p>
      <FundingSourceChecklist
        label="연동할 저축/투자 상품 (복수 선택 가능)"
        items={availableSavingsProducts}
        getId={(p) => p.id}
        getName={(p) => p.name}
        getAmountLabel={(p) => formatKrw(p.current_balance)}
        selectedIds={draft.savings_product_ids}
        onToggle={(id) => toggleDraftId(setDraft, "savings_product_ids", id)}
        emptyMessage="연동 가능한 저축/투자 상품이 없어요."
        hint="잔액이 합산되고, 월 저축액은 연동 상품들의 월 계획 합계예요. 다른 목표에 연동된 상품과 부동산은 안 보여요."
      />
      <FundingSourceChecklist
        label="연동할 계좌 (복수 선택 가능)"
        items={accounts}
        getId={({ account }) => account.id}
        getName={({ account }) => account.name}
        getAmountLabel={({ balance }) => formatKrw(balance)}
        selectedIds={draft.account_ids}
        onToggle={(id) => toggleDraftId(setDraft, "account_ids", id)}
        emptyMessage="등록된 계좌가 없어요."
      />
      <FundingSourceChecklist
        label="연동할 대출 (연동 시 금액에서 차감돼요)"
        items={availableLoans}
        getId={(loan) => loan.id}
        getName={(loan) => loan.name}
        getAmountLabel={(loan) => `-${formatKrw(loan.balance)}`}
        amountClassName={amountToneClass("negative")}
        selectedIds={draft.loan_ids}
        onToggle={(id) => toggleDraftId(setDraft, "loan_ids", id)}
        emptyMessage="등록된 대출이 없어요."
        hint="현재 저축액 = 연동 상품·계좌 잔액 − 연동 대출 잔액"
      />
    </>
  );
}

function PlanStep({
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
