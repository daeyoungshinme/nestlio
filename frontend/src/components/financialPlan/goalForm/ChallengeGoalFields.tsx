import { useId } from "react";
import AmountInput from "@/components/common/AmountInput";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import type { GoalFieldsProps } from "@/components/financialPlan/goalForm/goalFormShared";
import { FORM_LABEL, TEXTAREA_SM } from "@/constants/inputStyles";

/** 챌린지 — 기간과 목표 금액만 있는 짧은 도전. 진행 금액은 수정할 때만 입력한다. */
export default function ChallengeGoalFields({
  draft,
  setDraft,
  submitLabel,
  submitting,
  isEditing,
}: GoalFieldsProps & { isEditing: boolean }) {
  const descriptionId = useId();
  return (
    <>
      <FormInput
        label="챌린지 제목"
        value={draft.name}
        maxLength={100}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        className="w-full"
        required
      />
      <div>
        <label htmlFor={descriptionId} className={FORM_LABEL}>설명 (선택)</label>
        <textarea
          id={descriptionId}
          value={draft.description}
          maxLength={500}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          className={`w-full ${TEXTAREA_SM}`}
          rows={2}
        />
      </div>
      <AmountInput
        label="목표 금액"
        value={draft.required_amount}
        onChange={(value) => setDraft((d) => ({ ...d, required_amount: value }))}
        className="w-full"
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
      {isEditing && (
        <AmountInput
          label="진행 금액"
          value={draft.current_amount}
          onChange={(value) => setDraft((d) => ({ ...d, current_amount: value }))}
          className="w-full"
        />
      )}
      <Button type="submit" loading={submitting} className="mt-2">
        {submitLabel}
      </Button>
    </>
  );
}
