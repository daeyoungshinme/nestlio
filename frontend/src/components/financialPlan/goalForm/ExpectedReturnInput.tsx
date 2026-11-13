import FormInput from "@/components/common/FormInput";
import type { SetDraft } from "@/components/financialPlan/goalForm/goalFormShared";

/** 기대 연 수익률 % 입력 — 입력하면 백엔드가 월 복리로 예상 달성월을 계산한다. */
export default function ExpectedReturnInput({
  value,
  setDraft,
  label = "기대 연 수익률 % (선택)",
  hint = "입력하면 월 복리로 예상 달성월을 계산해요.",
}: {
  value: string;
  setDraft: SetDraft;
  label?: string;
  hint?: string;
}) {
  return (
    <FormInput
      label={label}
      type="number"
      inputMode="decimal"
      step="0.1"
      value={value}
      onChange={(e) => setDraft((d) => ({ ...d, expected_annual_return_pct: e.target.value }))}
      className="w-full"
      hint={hint}
    />
  );
}
