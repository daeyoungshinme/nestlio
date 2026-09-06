import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import Tabs from "@/components/common/Tabs";
import FundingSourceChecklist from "@/components/financialPlan/FundingSourceChecklist";
import GoalMonthlyTargetEditor from "@/components/financialPlan/GoalMonthlyTargetEditor";
import { fetchGrowlioGoalSettings } from "@/api/goals";
import { FORM_LABEL, FORM_SECTION_LABEL, TEXTAREA_SM } from "@/constants/inputStyles";
import { isGrowlioLinkedInvestment } from "@/constants/growlio";
import { syncTargetsToPeriod } from "@/utils/monthRange";
import { currentDateIso } from "@/utils/date";
import { extractErrorMessage } from "@/utils/error";
import { formatKrw, formatKrwPreview, toAmountInputValue } from "@/utils/format";
import { toast } from "@/utils/toast";
import {
  EMPTY_CHALLENGE_DRAFT,
  EMPTY_GOAL_DRAFT,
  toYearMonth,
  type Draft,
} from "@/components/financialPlan/goalDraft";
import type {
  AccountWithBalanceOut,
  FinancialGoalOut,
  GoalMonthlyTargetIn,
  LoanOut,
  SavingsProductOut,
} from "@/types";

const GOAL_KIND_TABS = ["장기 목표", "챌린지"] as const;
type GoalKindTab = (typeof GOAL_KIND_TABS)[number];
const GOAL_KIND_TAB_TO_KIND: Record<GoalKindTab, "goal" | "challenge"> = {
  "장기 목표": "goal",
  챌린지: "challenge",
};
const KIND_TO_GOAL_KIND_TAB: Record<"goal" | "challenge", GoalKindTab> = {
  goal: "장기 목표",
  challenge: "챌린지",
};

/** start~end 사이 전체 개월 수 — 백엔드 app/utils/dates.py::months_between과 동일한 규칙(일 차이는 무시). */
function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}



export default function GoalFormModal({
  initial,
  title,
  submitLabel,
  submitting,
  savingsProducts,
  accounts,
  loans,
  existingGoal,
  onClose,
  onSubmit,
}: {
  initial: Draft;
  title: string;
  submitLabel: string;
  submitting: boolean;
  savingsProducts: SavingsProductOut[];
  accounts: AccountWithBalanceOut[];
  loans: LoanOut[];
  existingGoal: FinancialGoalOut | null;
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [currentAge, setCurrentAge] = useState("");
  const isChallenge = draft.kind === "challenge";
  // 유형 선택은 생성 시에만 가능하다(백엔드 FinancialGoalUpdateIn에 kind 필드 자체가 없어 생성 후
  // 유형 변경이 불가능) — 수정 모드에서는 토글을 숨기고 기존 kind별 폼만 보여준다. 이름은 유형을
  // 바꿔도 다시 입력하지 않도록 보존하고, 나머지 필드는 빈 초안으로 리셋한다(필드 구성이 크게 다름).
  const kindToggle =
    existingGoal === null ? (
      <Tabs
        tabs={GOAL_KIND_TABS}
        activeTab={KIND_TO_GOAL_KIND_TAB[draft.kind]}
        onChange={(tab) => {
          const nextKind = GOAL_KIND_TAB_TO_KIND[tab];
          setDraft((d) => ({
            ...(nextKind === "challenge" ? EMPTY_CHALLENGE_DRAFT : EMPTY_GOAL_DRAFT),
            name: d.name,
          }));
        }}
        variant="pill"
      />
    ) : null;
  const isLinked =
    draft.savings_product_ids.length > 0 || draft.account_ids.length > 0 || draft.loan_ids.length > 0;
  // 다른 목표에 이미 연동된 상품은 선택지에서 제외 — 연동되면 어느 목표를 따를지 모호해지기 때문.
  // 지금 이 목표에 이미 연동된 상품(existingGoal.id와 일치)은 계속 보여준다.
  const availableSavingsProducts = savingsProducts.filter(
    (p) => p.linked_goal_id === null || p.linked_goal_id === existingGoal?.id,
  );

  // 시작일/종료일이 바뀌면 월별 목표금액 행도 그 기간에 맞춰 다시 맞춘다 — 겹치는 달의 금액은 보존.
  const syncMonthlyTargetsToPeriod = (startDate: string, targetDate: string, existing: GoalMonthlyTargetIn[]) =>
    syncTargetsToPeriod(toYearMonth(startDate), toYearMonth(targetDate), existing);

  const growlioGoalMutation = useMutation({
    mutationFn: fetchGrowlioGoalSettings,
    onSuccess: (data) => {
      if (!data.is_configured || data.goal_amount === null) {
        toast("growlio에 설정된 투자목표가 없어요.", "error");
        return;
      }
      const goalAmount = data.goal_amount;
      const annualDepositGoal = data.annual_deposit_goal;
      // 다른 목표에 이미 연동된 상품은 후보에서 제외(availableSavingsProducts 참고).
      const growlioProductIds = availableSavingsProducts.filter(isGrowlioLinkedInvestment).map((p) => String(p.id));
      setDraft((d) => ({
        ...d,
        name: d.name.trim() === "" ? "growlio 투자목표" : d.name,
        required_amount: String(Math.round(goalAmount)),
        monthly_saving_amount:
          annualDepositGoal !== null
            ? String(Math.round(annualDepositGoal / 12))
            : d.monthly_saving_amount,
        savings_product_ids: growlioProductIds.length > 0 ? growlioProductIds : d.savings_product_ids,
      }));
      toast(
        growlioProductIds.length > 0
          ? "growlio 투자목표를 불러왔어요."
          : "growlio 투자목표를 불러왔어요. 저축·투자 상품 탭에서 growlio 계좌를 먼저 가져오면 진행률이 자동 반영돼요.",
        "success",
      );
    },
    onError: (err) => toast(extractErrorMessage(err, "growlio 투자목표를 불러오지 못했습니다."), "error"),
  });

  const toggleId = (field: "savings_product_ids" | "account_ids" | "loan_ids", id: string) => {
    setDraft((d) => ({
      ...d,
      [field]: d[field].includes(id) ? d[field].filter((v) => v !== id) : [...d[field], id],
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit(draft);
  };

  if (isChallenge) {
    return (
      <Modal onClose={onClose} title={title}>
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
          {kindToggle}
          <FormInput
            label="챌린지 제목"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            className="w-full"
            required
          />
          <div>
            <label className={FORM_LABEL}>설명 (선택)</label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              className={`w-full ${TEXTAREA_SM}`}
              rows={2}
            />
          </div>
          <FormInput
            label="목표 금액"
            type="number"
            inputMode="decimal"
            value={draft.required_amount}
            onChange={(e) => setDraft((d) => ({ ...d, required_amount: e.target.value }))}
            className="w-full"
            preview={Number(draft.required_amount) > 0 ? formatKrwPreview(Number(draft.required_amount)) : undefined}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="시작일"
              type="date"
              value={draft.start_date}
              onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
              className="w-full"
            />
            <FormInput
              label="종료일"
              type="date"
              value={draft.target_date}
              onChange={(e) => setDraft((d) => ({ ...d, target_date: e.target.value }))}
              className="w-full"
              min={draft.start_date}
            />
          </div>
          {existingGoal && (
            <FormInput
              label="진행 금액"
              type="number"
              inputMode="decimal"
              value={draft.current_amount}
              onChange={(e) => setDraft((d) => ({ ...d, current_amount: e.target.value }))}
              className="w-full"
              preview={Number(draft.current_amount) > 0 ? formatKrwPreview(Number(draft.current_amount)) : undefined}
            />
          )}
          <Button type="submit" loading={submitting} className="mt-2">
            {submitLabel}
          </Button>
        </form>
      </Modal>
    );
  }

  // 수정 모드에서 아직 아무것도 고치지 않았다면(초안이 저장된 값과 같다면) 백엔드가 이미 계산해
  // 내려준 months_remaining/suggested_monthly_amount(app/services/goal_service.py::
  // compute_months_remaining/compute_suggested_monthly_amount)를 그대로 보여준다. 목표일/나이/
  // 필요금액/현재저축액 중 하나라도 바뀌는 순간부터는 "저장하면 어떻게 될지" 미리보기가 필요하므로
  // 프론트에서 직접 계산한다 — 신규 생성 모드는 저장된 값 자체가 없어 항상 이 경로를 쓴다.
  const draftMatchesExistingGoal =
    existingGoal !== null &&
    draft.target_date === (existingGoal.target_date ?? "") &&
    draft.target_age === (existingGoal.target_age !== null ? String(existingGoal.target_age) : "") &&
    draft.required_amount === toAmountInputValue(existingGoal.required_amount) &&
    draft.current_amount === toAmountInputValue(existingGoal.current_amount);

  const monthsRemainingFromDate = draft.target_date !== "" ? monthsBetween(new Date(), new Date(draft.target_date)) : null;
  const monthsRemainingFromAge =
    currentAge !== "" && draft.target_age !== "" ? (Number(draft.target_age) - Number(currentAge)) * 12 : null;
  const monthsRemaining =
    draftMatchesExistingGoal && existingGoal
      ? existingGoal.months_remaining
      : (monthsRemainingFromDate ?? monthsRemainingFromAge);
  const suggestedMonthly =
    draftMatchesExistingGoal && existingGoal && existingGoal.suggested_monthly_amount !== null
      ? Math.round(Number(existingGoal.suggested_monthly_amount))
      : monthsRemaining !== null && monthsRemaining > 0
        ? Math.max(0, Math.round((Number(draft.required_amount) - Number(draft.current_amount)) / monthsRemaining))
        : null;

  // 장기목표의 "현재 진행액" — 연동이면 백엔드가 내려준 현재 잔액 합, 미연동이면 폼에 입력된 값.
  // 균등분배 버튼이 "필요금액 - 여기까지 모은 금액"을 남은 달에 나누는 기준이 된다.
  const currentProgressForDistribution =
    isLinked && existingGoal ? Number(existingGoal.current_amount) : Number(draft.current_amount) || 0;
  const hasMonthlyPlan = draft.monthly_targets.length > 0;

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
        {kindToggle}
        <p className={FORM_SECTION_LABEL}>기본 정보</p>
        {/* 저장 전에는 아무것도 반영되지 않으므로(모달을 닫으면 원복) 별도 확인 모달 없이 바로 불러온다. */}
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
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label="순위"
            type="number"
            value={draft.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
            className="w-full"
          />
          <FormInput
            label="목표일 (두 분이 함께 정한 날짜)"
            type="date"
            value={draft.target_date}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                target_date: e.target.value,
                monthly_targets:
                  e.target.value === "" ? [] : syncMonthlyTargetsToPeriod(currentDateIso(), e.target.value, d.monthly_targets),
              }))
            }
            className="w-full"
          />
        </div>
        {draft.target_date === "" && (
          <FormInput
            label="필요한 나이 (목표일 대신 나이로 정할 때)"
            type="number"
            value={draft.target_age}
            onChange={(e) => setDraft((d) => ({ ...d, target_age: e.target.value }))}
            className="w-full"
          />
        )}
        <FormInput
          label="필요금액"
          type="number"
          inputMode="decimal"
          value={draft.required_amount}
          onChange={(e) => setDraft((d) => ({ ...d, required_amount: e.target.value }))}
          className="w-full"
          preview={Number(draft.required_amount) > 0 ? formatKrwPreview(Number(draft.required_amount)) : undefined}
        />
        <CollapsibleGroup
          header={<span className="text-sm font-medium text-gray-700 dark:text-gray-300">연동 항목</span>}
          amount={
            isLinked
              ? `${draft.savings_product_ids.length + draft.account_ids.length + draft.loan_ids.length}건 연동`
              : "연동 안 함"
          }
          defaultOpen={isLinked}
        >
          <FundingSourceChecklist
            label="연동할 저축/투자 상품 (복수 선택 가능)"
            items={availableSavingsProducts}
            getId={(p) => p.id}
            getName={(p) => p.name}
            getAmountLabel={(p) => formatKrw(p.current_balance)}
            selectedIds={draft.savings_product_ids}
            onToggle={(id) => toggleId("savings_product_ids", id)}
            emptyMessage="연동 가능한 저축/투자 상품이 없어요."
            hint="상품을 1개만 연동하면 그 상품의 월 계획액이 이 목표의 월 저축액으로 자동 설정되고
            저축상품 화면에서 직접 수정할 수 없어져요. 부부가 각자 다른 상품으로 함께 모을 때처럼
            여러 개를 연동하면 잔액은 합산되지만 월 계획액은 각 상품에서 계속 따로 입력해요.
            다른 목표에 이미 연동된 상품은 목록에 나오지 않아요."
          />
          <FundingSourceChecklist
            label="연동할 계좌 (복수 선택 가능)"
            items={accounts}
            getId={({ account }) => account.id}
            getName={({ account }) => account.name}
            getAmountLabel={({ balance }) => formatKrw(balance)}
            selectedIds={draft.account_ids}
            onToggle={(id) => toggleId("account_ids", id)}
            emptyMessage="등록된 계좌가 없어요."
          />
          <FundingSourceChecklist
            label="연동할 대출 (연동 시 금액에서 차감돼요)"
            items={loans}
            getId={(loan) => loan.id}
            getName={(loan) => loan.name}
            getAmountLabel={(loan) => `-${formatKrw(loan.balance)}`}
            amountClassName="text-red-500 dark:text-red-400"
            selectedIds={draft.loan_ids}
            onToggle={(id) => toggleId("loan_ids", id)}
            emptyMessage="등록된 대출이 없어요."
            hint="상품·계좌·대출을 연동하면 현재 저축액이 (연동된 상품·계좌 잔액 합) − (연동된 대출 잔액)으로
            자동 계산돼요. 부부가 각자 다른 상품/계좌로 한 목표를 함께 모을 때 여러 개를 선택하세요."
          />
        </CollapsibleGroup>
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
          <FormInput
            label="현재 저축액"
            type="number"
            inputMode="decimal"
            value={draft.current_amount}
            onChange={(e) => setDraft((d) => ({ ...d, current_amount: e.target.value }))}
            className="w-full"
            preview={Number(draft.current_amount) > 0 ? formatKrwPreview(Number(draft.current_amount)) : undefined}
          />
        )}
        {draft.target_date !== "" && (
          <GoalMonthlyTargetEditor
            startMonth={toYearMonth(currentDateIso())}
            endMonth={toYearMonth(draft.target_date)}
            targets={draft.monthly_targets}
            onChange={(monthly_targets) => setDraft((d) => ({ ...d, monthly_targets }))}
            distributeAmount={String(Math.max(0, Number(draft.required_amount) - currentProgressForDistribution))}
          />
        )}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">필요 저축액 자동 계산</p>
          {draft.target_date === "" && (
            <div className="flex items-end gap-2">
              <FormInput
                label="현재 나이"
                type="number"
                value={currentAge}
                onChange={(e) => setCurrentAge(e.target.value)}
                className="w-24"
              />
            </div>
          )}
          {suggestedMonthly !== null && (
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
            <p className="text-xs text-red-500">목표일(또는 필요한 나이)이 지금보다 이후여야 계산할 수 있어요.</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            (필요금액 - 현재 저축액) ÷ 남은 개월 수로 월 저축금액을 제안해요. 저장되지 않고 계산에만 쓰여요.
          </p>
        </div>
        <FormInput
          label="월 저축금액"
          type="number"
          inputMode="decimal"
          value={draft.monthly_saving_amount}
          onChange={(e) => setDraft((d) => ({ ...d, monthly_saving_amount: e.target.value }))}
          className="w-full"
          preview={
            Number(draft.monthly_saving_amount) > 0 ? formatKrwPreview(Number(draft.monthly_saving_amount)) : undefined
          }
        />
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
