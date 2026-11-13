import Button from "@/components/common/Button";
import CollapsibleHint from "@/components/common/CollapsibleHint";
import FormInput from "@/components/common/FormInput";
import FundingSourceChecklist from "@/components/financialPlan/FundingSourceChecklist";
import ExpectedReturnInput from "@/components/financialPlan/goalForm/ExpectedReturnInput";
import { toggleDraftId, type GoalFieldsProps } from "@/components/financialPlan/goalForm/goalFormShared";
import type { FinancialGoalOut, UserOut } from "@/types";
import { sumAmounts } from "@/utils/amount";
import { formErrorTextClass } from "@/utils/colors";
import { formatKrw } from "@/utils/format";

/** 통합 목표 — 장기 목표와 가구 구성원 growlio 목표를 골라 묶는다. 금액은 백엔드가 합산한다. */
export default function CombinedGoalFields({
  draft,
  setDraft,
  submitLabel,
  submitting,
  existingGoal,
  goals,
  users,
}: GoalFieldsProps & {
  existingGoal: FinancialGoalOut | null;
  goals: FinancialGoalOut[];
  users: UserOut[];
}) {
  const memberCandidates = goals.filter((g) => g.kind === "goal");
  const selectedGoalsTotal = sumAmounts(
    memberCandidates.filter((g) => draft.member_goal_ids.includes(String(g.id))),
    (g) => g.required_amount,
  );
  // 이미 저장된 통합 목표면 growlio 목표금액을 알고 있다(저장 전 새 목표는 저장 후 합산).
  const knownGrowlioTotal = sumAmounts(
    (existingGoal?.combined_members ?? []).filter(
      (m) => m.type === "growlio" && m.user_id !== null && draft.growlio_user_ids.includes(m.user_id),
    ),
    (m) => m.required_amount ?? "0",
  );
  const hasSelection = draft.member_goal_ids.length > 0 || draft.growlio_user_ids.length > 0;
  return (
    <>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300 space-y-1">
        <p>
          고른 목표의 합계가 통합 목표예요. 지금 고른 장기 목표{" "}
          <span className="font-semibold text-gray-900 dark:text-gray-50">{formatKrw(selectedGoalsTotal)}</span>
          {existingGoal !== null && draft.growlio_user_ids.length > 0 && (
            <>
              {" "}+ growlio 목표{" "}
              <span className="font-semibold text-gray-900 dark:text-gray-50">{formatKrw(knownGrowlioTotal)}</span>
            </>
          )}
        </p>
        <CollapsibleHint summary="growlio 목표는 각자 nestlio를 열 때 불러와요.">
          growlio 목표금액·투자자산(부동산 제외)은 각자 nestlio를 열 때 저장되고, 배우자 값은 마지막으로 불러온 시점
          기준이에요. 목표금액은 고른 목표를 단순히 더한 값이라, 같은 돈을 노리는 목표를 함께 고르면 합계가 커져요.
          growlio에서 가져온 투자 상품처럼 growlio 투자자산과 겹치는 금액은 현재 금액에서 한 번만 세요.
        </CollapsibleHint>
      </div>
      <FormInput
        label="목표 이름"
        value={draft.name}
        maxLength={100}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        className="w-full"
        required
      />
      <FundingSourceChecklist
        label="부부 각자의 growlio 투자목표"
        items={users}
        getId={(u) => u.id}
        getName={(u) => `${u.display_name}의 growlio 목표`}
        getAmountLabel={() => ""}
        selectedIds={draft.growlio_user_ids}
        onToggle={(id) => toggleDraftId(setDraft, "growlio_user_ids", id)}
        emptyMessage="가구 구성원이 없어요."
      />
      <FundingSourceChecklist
        label="함께 묶을 장기 목표"
        items={memberCandidates}
        getId={(g) => g.id}
        getName={(g) => g.name}
        getAmountLabel={(g) => `목표 ${formatKrw(g.required_amount)}`}
        selectedIds={draft.member_goal_ids}
        onToggle={(id) => toggleDraftId(setDraft, "member_goal_ids", id)}
        emptyMessage="장기 목표가 아직 없어요. growlio 목표만 묶어도 돼요."
      />
      {!hasSelection && <p className={`text-xs ${formErrorTextClass()}`}>묶을 목표를 하나 이상 골라 주세요.</p>}
      <FormInput
        label="목표일 (선택)"
        type="date"
        value={draft.target_date}
        onChange={(e) => setDraft((d) => ({ ...d, target_date: e.target.value }))}
        className="w-full"
      />
      <ExpectedReturnInput value={draft.expected_annual_return_pct} setDraft={setDraft} />
      <Button type="submit" loading={submitting} disabled={!hasSelection} className="mt-2">
        {submitLabel}
      </Button>
    </>
  );
}
