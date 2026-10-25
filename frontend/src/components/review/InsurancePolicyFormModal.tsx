import { useId, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import AmountInput from "@/components/common/AmountInput";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import CoverageChips from "@/components/review/CoverageChips";
import RiderListEditor from "@/components/review/RiderListEditor";
import {
  OTHER_INSURED,
  policyDraftFrom,
  policyPayload,
  withPolicyType,
  type PolicyDraft,
} from "@/components/review/insurancePolicyDraft";
import { PAYMENT_FREQUENCY_LABEL, POLICY_TYPE_LABEL } from "@/constants/insurance";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { useRecurringAll } from "@/hooks/useReferenceData";
import type { Coverage, InsurancePolicyIn, InsurancePolicyOut, PaymentFrequency, PolicyType, UserOut } from "@/types";

interface Props {
  policy: InsurancePolicyOut | null;
  users: UserOut[] | undefined;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: InsurancePolicyIn) => void;
}

export default function InsurancePolicyFormModal({ policy, users, submitting, onClose, onSubmit }: Props) {
  const fieldId = useId();
  const [draft, setDraft] = useState<PolicyDraft>(() => policyDraftFrom(policy, users));
  const { data: recurring } = useRecurringAll();
  const expenseRecurrings = (recurring?.items ?? []).filter((r) => r.type === "expense");
  const isAuto = draft.policy_type === "auto";
  const showRenewalDate = draft.is_renewable || isAuto;

  const set = <K extends keyof PolicyDraft>(key: K, value: PolicyDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const changeType = (policyType: PolicyType) => setDraft((d) => withPolicyType(d, policyType));

  const toggleCoverage = (coverage: Coverage) =>
    setDraft((d) => ({
      ...d,
      coverages: d.coverages.includes(coverage) ? d.coverages.filter((c) => c !== coverage) : [...d.coverages, coverage],
    }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || draft.premium_amount === "") return;
    onSubmit(policyPayload(draft));
  };

  return (
    <Modal onClose={onClose} title={policy ? "보험 수정" : "보험 추가"}>
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
        <FormInput
          label="보험 이름"
          value={draft.name}
          maxLength={100}
          placeholder="예: OO실손의료비보험"
          onChange={(e) => set("name", e.target.value)}
          className="w-full"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${fieldId}-type`} className={`block mb-1 font-medium ${LABEL_SM}`}>
              종류
            </label>
            <select
              id={`${fieldId}-type`}
              className={`${INPUT_SM} w-full`}
              value={draft.policy_type}
              onChange={(e) => changeType(e.target.value as PolicyType)}
            >
              {Object.entries(POLICY_TYPE_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <FormInput
            label="보험사"
            value={draft.insurer}
            maxLength={50}
            onChange={(e) => set("insurer", e.target.value)}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${fieldId}-insured`} className={`block mb-1 font-medium ${LABEL_SM}`}>
              피보험자
            </label>
            <select
              id={`${fieldId}-insured`}
              className={`${INPUT_SM} w-full`}
              value={draft.insured}
              onChange={(e) => set("insured", e.target.value)}
            >
              {users?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ))}
              <option value={OTHER_INSURED}>그 외(자녀 등)</option>
            </select>
          </div>
          {draft.insured === OTHER_INSURED && (
            <FormInput
              label="피보험자 이름"
              value={draft.insured_name}
              maxLength={30}
              onChange={(e) => set("insured_name", e.target.value)}
              className="w-full"
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <AmountInput
            label="보험료"
            value={draft.premium_amount}
            onChange={(value) => set("premium_amount", value)}
            className="w-full"
            required
          />
          <div>
            <label htmlFor={`${fieldId}-freq`} className={`block mb-1 font-medium ${LABEL_SM}`}>
              납입 주기
            </label>
            <select
              id={`${fieldId}-freq`}
              className={`${INPUT_SM} w-full`}
              value={draft.payment_frequency}
              onChange={(e) => set("payment_frequency", e.target.value as PaymentFrequency)}
            >
              {Object.entries(PAYMENT_FREQUENCY_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isAuto && (
          <label className={`flex items-center gap-2 ${TOUCH_TARGET_MIN_HEIGHT} ${LABEL_SM}`}>
            <input
              type="checkbox"
              checked={draft.is_renewable}
              onChange={(e) => set("is_renewable", e.target.checked)}
              className="h-4 w-4"
            />
            갱신형이에요 (몇 년마다 보험료가 다시 정해져요)
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          {showRenewalDate && (
            <FormInput
              label="다음 갱신일"
              type="date"
              value={draft.next_renewal_date}
              onChange={(e) => set("next_renewal_date", e.target.value)}
              className="w-full"
            />
          )}
          <FormInput
            label="납입 끝나는 날"
            type="date"
            value={draft.payment_end_date}
            onChange={(e) => set("payment_end_date", e.target.value)}
            className="w-full"
          />
          <FormInput
            label="보장 끝나는 날"
            type="date"
            value={draft.coverage_end_date}
            onChange={(e) => set("coverage_end_date", e.target.value)}
            className="w-full"
          />
        </div>

        <RiderListEditor
          riders={draft.riders}
          onChange={(riders) => set("riders", riders)}
          policyPremium={draft.premium_amount}
          frequencyLabel={PAYMENT_FREQUENCY_LABEL[draft.payment_frequency]}
        />

        {draft.riders.length === 0 && <CoverageChips selected={draft.coverages} onToggle={toggleCoverage} />}

        <div>
          <label htmlFor={`${fieldId}-recurring`} className={`block mb-1 font-medium ${LABEL_SM}`}>
            연결할 반복 내역 (선택)
          </label>
          <select
            id={`${fieldId}-recurring`}
            className={`${INPUT_SM} w-full`}
            value={draft.recurring_expense_id}
            onChange={(e) => set("recurring_expense_id", e.target.value)}
          >
            <option value="">연결 안 함</option>
            {expenseRecurrings.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.is_active ? "" : " (중지됨)"}
              </option>
            ))}
          </select>
        </div>
        <FormInput
          label="메모"
          value={draft.memo}
          maxLength={200}
          onChange={(e) => set("memo", e.target.value)}
          className="w-full"
        />
        <Button type="submit" loading={submitting} className="mt-2">
          {policy ? "저장" : "추가"}
        </Button>
      </form>
    </Modal>
  );
}
