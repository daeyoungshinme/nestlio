import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import { fetchRecurring } from "@/api/recurring";
import { COVERAGE_LABEL, DEFAULT_COVERAGES, PAYMENT_FREQUENCY_LABEL, POLICY_TYPE_LABEL } from "@/constants/insurance";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { TOUCH_TARGET_COMPACT_MOBILE_ONLY } from "@/constants/uiSizes";
import { selectableChipClass } from "@/utils/colors";
import { amountInputPreview, toAmountInputValue } from "@/utils/format";
import type { Coverage, InsurancePolicyIn, InsurancePolicyOut, PaymentFrequency, PolicyType, UserOut } from "@/types";

/** 피보험자 select 값 — 부부 user id 또는 "other"(자녀 등, 이름 직접 입력). */
const OTHER_INSURED = "other";

interface Draft {
  name: string;
  insurer: string;
  policy_type: PolicyType;
  insured: string;
  insured_name: string;
  premium_amount: string;
  payment_frequency: PaymentFrequency;
  is_renewable: boolean;
  next_renewal_date: string;
  payment_end_date: string;
  coverage_end_date: string;
  coverages: Coverage[];
  recurring_expense_id: string;
  memo: string;
}

function draftFrom(policy: InsurancePolicyOut | null, users: UserOut[] | undefined): Draft {
  if (!policy) {
    return {
      name: "",
      insurer: "",
      policy_type: "indemnity",
      insured: users?.[0]?.id ?? OTHER_INSURED,
      insured_name: "",
      premium_amount: "",
      payment_frequency: "monthly",
      is_renewable: false,
      next_renewal_date: "",
      payment_end_date: "",
      coverage_end_date: "",
      coverages: DEFAULT_COVERAGES.indemnity ?? [],
      recurring_expense_id: "",
      memo: "",
    };
  }
  return {
    name: policy.name,
    insurer: policy.insurer ?? "",
    policy_type: policy.policy_type,
    insured: policy.insured_user_id ?? OTHER_INSURED,
    insured_name: policy.insured_name ?? "",
    premium_amount: toAmountInputValue(policy.premium_amount),
    payment_frequency: policy.payment_frequency,
    is_renewable: policy.is_renewable,
    next_renewal_date: policy.next_renewal_date ?? "",
    payment_end_date: policy.payment_end_date ?? "",
    coverage_end_date: policy.coverage_end_date ?? "",
    coverages: policy.coverages,
    recurring_expense_id: policy.recurring_expense_id !== null ? String(policy.recurring_expense_id) : "",
    memo: policy.memo ?? "",
  };
}

function toPayload(draft: Draft): InsurancePolicyIn {
  const isOther = draft.insured === OTHER_INSURED;
  const renewable = draft.is_renewable || draft.policy_type === "auto";
  return {
    name: draft.name.trim(),
    insurer: draft.insurer.trim() || null,
    policy_type: draft.policy_type,
    insured_user_id: isOther ? null : draft.insured,
    insured_name: isOther ? draft.insured_name.trim() || null : null,
    premium_amount: draft.premium_amount,
    payment_frequency: draft.payment_frequency,
    is_renewable: renewable,
    next_renewal_date: renewable ? draft.next_renewal_date || null : null,
    payment_end_date: draft.payment_end_date || null,
    coverage_end_date: draft.coverage_end_date || null,
    coverages: draft.coverages,
    recurring_expense_id: draft.recurring_expense_id ? Number(draft.recurring_expense_id) : null,
    memo: draft.memo.trim() || null,
  };
}

interface Props {
  policy: InsurancePolicyOut | null;
  users: UserOut[] | undefined;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: InsurancePolicyIn) => void;
}

export default function InsurancePolicyFormModal({ policy, users, submitting, onClose, onSubmit }: Props) {
  const fieldId = useId();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(policy, users));
  const { data: recurring } = useQuery({
    queryKey: QUERY_KEYS.recurring,
    queryFn: () => fetchRecurring({ include_inactive: true }),
  });
  const expenseRecurrings = (recurring?.items ?? []).filter((r) => r.type === "expense");
  const isAuto = draft.policy_type === "auto";
  const showRenewalDate = draft.is_renewable || isAuto;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const changeType = (policyType: PolicyType) =>
    setDraft((d) => {
      // 보장이 비어 있거나 이전 종류의 대표 보장 그대로면 새 종류의 대표 보장으로 바꾼다(직접 고친 건 건드리지 않는다).
      const prevDefaults = DEFAULT_COVERAGES[d.policy_type] ?? [];
      const untouched =
        d.coverages.length === prevDefaults.length && d.coverages.every((c) => prevDefaults.includes(c));
      return {
        ...d,
        policy_type: policyType,
        coverages: untouched ? (DEFAULT_COVERAGES[policyType] ?? []) : d.coverages,
      };
    });

  const toggleCoverage = (coverage: Coverage) =>
    setDraft((d) => ({
      ...d,
      coverages: d.coverages.includes(coverage) ? d.coverages.filter((c) => c !== coverage) : [...d.coverages, coverage],
    }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || draft.premium_amount === "") return;
    onSubmit(toPayload(draft));
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
          <FormInput
            label="보험료"
            type="number"
            inputMode="decimal"
            value={draft.premium_amount}
            onChange={(e) => set("premium_amount", e.target.value)}
            className="w-full"
            preview={amountInputPreview(draft.premium_amount)}
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
          <label className={`flex items-center gap-2 min-h-[44px] ${LABEL_SM}`}>
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

        <div>
          <p id={`${fieldId}-coverages`} className={`block mb-1 font-medium ${LABEL_SM}`}>
            주요 보장 (겹치는 보장을 찾을 때 써요)
          </p>
          <div role="group" aria-labelledby={`${fieldId}-coverages`} className="flex flex-wrap gap-1.5">
            {(Object.keys(COVERAGE_LABEL) as Coverage[]).map((coverage) => {
              const selected = draft.coverages.includes(coverage);
              return (
                <button
                  key={coverage}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCoverage(coverage)}
                  className={`rounded-full px-3 text-xs font-medium transition-colors ${TOUCH_TARGET_COMPACT_MOBILE_ONLY} ${selectableChipClass(selected)}`}
                >
                  {COVERAGE_LABEL[coverage]}
                </button>
              );
            })}
          </div>
        </div>

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
