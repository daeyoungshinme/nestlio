import { Download } from "lucide-react";
import AmountInput from "@/components/common/AmountInput";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { useGrowlioGoalImport } from "@/components/financialPlan/goalForm/goalFormShared";
import type { LongTermGoalFieldsProps } from "@/components/financialPlan/goalForm/longTermGoalTypes";
import { toYearMonth } from "@/components/financialPlan/goalDraft";
import { FORM_SECTION_LABEL } from "@/constants/inputStyles";
import { currentDateIso } from "@/utils/date";
import { syncTargetsToPeriod } from "@/utils/monthRange";

/** 장기 목표 1단계 — 이름·순위·목표일(또는 나이)·필요금액, growlio 투자목표 불러오기. */
export default function LongTermBasicsStep({ draft, setDraft, existingGoal, availableSavingsProducts }: LongTermGoalFieldsProps) {
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
