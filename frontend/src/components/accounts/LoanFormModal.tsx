import { useId, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import AmountInput from "@/components/common/AmountInput";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import OwnerSelect from "@/components/common/OwnerSelect";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { toAmountInputValue } from "@/utils/format";
import type { LoanCreateIn, LoanOut, RepaymentMethod, UserOut } from "@/types";

export const REPAYMENT_METHOD_LABEL: Record<RepaymentMethod, string> = {
  equal_payment: "원리금균등",
  equal_principal: "원금균등",
  bullet: "만기일시상환",
  grace_period: "거치식",
  other: "기타",
};

export interface LoanDraft {
  name: string;
  balance: string;
  monthly_payment: string;
  origination_year_month: string;
  term_months: string;
  interest_rate: string;
  repayment_method: RepaymentMethod | "";
  owner_user_id: string;
}

export const EMPTY_LOAN_DRAFT: LoanDraft = {
  name: "",
  balance: "0",
  monthly_payment: "0",
  origination_year_month: "",
  term_months: "",
  interest_rate: "",
  repayment_method: "",
  owner_user_id: "",
};

export function draftFromLoan(loan: LoanOut): LoanDraft {
  return {
    name: loan.name,
    balance: toAmountInputValue(loan.balance),
    monthly_payment: toAmountInputValue(loan.monthly_payment),
    origination_year_month: loan.origination_year_month ?? "",
    term_months: loan.term_months !== null ? String(loan.term_months) : "",
    interest_rate: loan.interest_rate ?? "",
    repayment_method: loan.repayment_method ?? "",
    owner_user_id: loan.owner_user_id ?? "",
  };
}

export function toLoanPayload(draft: LoanDraft): LoanCreateIn {
  return {
    name: draft.name,
    balance: draft.balance,
    monthly_payment: draft.monthly_payment,
    origination_year_month: draft.origination_year_month || null,
    term_months: draft.term_months === "" ? null : Number(draft.term_months),
    interest_rate: draft.interest_rate === "" ? null : draft.interest_rate,
    repayment_method: draft.repayment_method || null,
    owner_user_id: draft.owner_user_id || null,
  };
}

interface Props {
  initial: LoanDraft;
  title: string;
  submitLabel: string;
  submitting: boolean;
  users: UserOut[] | undefined;
  onClose: () => void;
  onSubmit: (draft: LoanDraft) => void;
}

export default function LoanFormModal({ initial, title, submitLabel, submitting, users, onClose, onSubmit }: Props) {
  const repaymentId = useId();
  const [draft, setDraft] = useState<LoanDraft>(initial);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit(draft);
  };

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
        <FormInput
          label="상품명"
          value={draft.name}
          maxLength={100}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <AmountInput
            label="대출잔액"
            value={draft.balance}
            onChange={(value) => setDraft((d) => ({ ...d, balance: value }))}
            className="w-full"
          />
          <AmountInput
            label="월납입금액"
            value={draft.monthly_payment}
            onChange={(value) => setDraft((d) => ({ ...d, monthly_payment: value }))}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label="대출연월"
            type="month"
            value={draft.origination_year_month}
            onChange={(e) => setDraft((d) => ({ ...d, origination_year_month: e.target.value }))}
            className="w-full"
          />
          <FormInput
            label="대출기간(개월)"
            type="number"
            inputMode="numeric"
            value={draft.term_months}
            onChange={(e) => setDraft((d) => ({ ...d, term_months: e.target.value }))}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label="이자율(%)"
            type="number"
            inputMode="decimal"
            value={draft.interest_rate}
            onChange={(e) => setDraft((d) => ({ ...d, interest_rate: e.target.value }))}
            className="w-full"
          />
          <div>
            <label htmlFor={repaymentId} className={`block mb-1 font-medium ${LABEL_SM}`}>
              상환방식
            </label>
            <select
              id={repaymentId}
              className={`${INPUT_SM} w-full`}
              value={draft.repayment_method}
              onChange={(e) => setDraft((d) => ({ ...d, repayment_method: e.target.value as RepaymentMethod | "" }))}
            >
              <option value="">선택 안함</option>
              {Object.entries(REPAYMENT_METHOD_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <OwnerSelect
          value={draft.owner_user_id}
          onChange={(owner_user_id) => setDraft((d) => ({ ...d, owner_user_id }))}
          users={users}
        />
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
