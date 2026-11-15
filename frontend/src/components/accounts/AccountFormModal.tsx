import { useId, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import AmountInput from "@/components/common/AmountInput";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import OwnerSelect from "@/components/common/OwnerSelect";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { toAmountInputValue } from "@/utils/format";
import type { AccountOut, AccountWithBalanceOut, UserOut } from "@/types";

export const ACCOUNT_TYPE_LABEL: Record<AccountOut["account_type"], string> = {
  bank: "은행",
  cash: "현금",
};

export const ACCOUNT_TYPES: AccountOut["account_type"][] = ["bank", "cash"];

export interface AccountDraft {
  name: string;
  account_type: AccountOut["account_type"];
  /** 신규 등록 모드에서는 "초기 잔액", 수정 모드에서는 "현재 잔액"을 의미한다. */
  amount: string;
  owner_user_id: string;
}

export const EMPTY_ACCOUNT_DRAFT: AccountDraft = { name: "", account_type: "bank", amount: "0", owner_user_id: "" };

export function draftFromAccount(row: AccountWithBalanceOut): AccountDraft {
  return {
    name: row.account.name,
    account_type: row.account.account_type,
    amount: toAmountInputValue(row.balance),
    owner_user_id: row.account.owner_user_id ?? "",
  };
}

interface Props {
  initial: AccountDraft;
  title: string;
  amountLabel: string;
  submitLabel: string;
  submitting: boolean;
  users: UserOut[] | undefined;
  onClose: () => void;
  onSubmit: (draft: AccountDraft) => void;
}

export default function AccountFormModal({ initial, title, amountLabel, submitLabel, submitting, users, onClose, onSubmit }: Props) {
  const typeId = useId();
  const [draft, setDraft] = useState<AccountDraft>(initial);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit(draft);
  };

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
        <FormInput
          label="이름"
          value={draft.name}
          maxLength={100}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <div>
          <label htmlFor={typeId} className={`block mb-1 font-medium ${LABEL_SM}`}>
            종류
          </label>
          <select
            id={typeId}
            className={`${INPUT_SM} w-full`}
            value={draft.account_type}
            onChange={(e) => setDraft((d) => ({ ...d, account_type: e.target.value as AccountOut["account_type"] }))}
          >
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACCOUNT_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </div>
        <OwnerSelect
          value={draft.owner_user_id}
          onChange={(owner_user_id) => setDraft((d) => ({ ...d, owner_user_id }))}
          users={users}
        />
        <AmountInput
          label={amountLabel}
          value={draft.amount}
          onChange={(value) => setDraft((d) => ({ ...d, amount: value }))}
          className="w-full"
          allowNegative
        />
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
