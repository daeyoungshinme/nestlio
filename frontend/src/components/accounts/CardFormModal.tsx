import { useId, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import OwnerSelect from "@/components/common/OwnerSelect";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { CARD_TYPE_LABEL } from "@/constants/transactions";
import type { AccountWithBalanceOut, CardType, CardWithUsageOut, UserOut } from "@/types";

export interface CardDraft {
  name: string;
  card_type: CardType;
  payment_account_id: string;
  owner_user_id: string;
  apply_to_unlinked: boolean;
}

export const EMPTY_CARD_DRAFT: CardDraft = { name: "", card_type: "credit", payment_account_id: "", owner_user_id: "", apply_to_unlinked: false };

export function cardDraftFrom({ card }: CardWithUsageOut): CardDraft {
  return {
    name: card.name,
    card_type: card.card_type,
    payment_account_id: card.payment_account?.is_active ? String(card.payment_account.id) : "",
    owner_user_id: card.owner_user_id ?? "",
    apply_to_unlinked: false,
  };
}

/** 결제카드 추가·수정 폼 — 수정 중이고 결제계좌를 고르면 계좌 없이 기록된 지난 거래에도 적용할지 묻는다. */
export default function CardFormModal({
  initial,
  unlinkedCount,
  title,
  submitLabel,
  submitting,
  accounts,
  users,
  onClose,
  onSubmit,
}: {
  initial: CardDraft;
  unlinkedCount: number;
  title: string;
  submitLabel: string;
  submitting: boolean;
  accounts: AccountWithBalanceOut[];
  users: UserOut[] | undefined;
  onClose: () => void;
  onSubmit: (draft: CardDraft) => void;
}) {
  const fieldId = useId();
  const [draft, setCardDraft] = useState<CardDraft>(initial);

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
          placeholder="예: 신한 체크카드"
          onChange={(e) => setCardDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <div>
          <label htmlFor={`${fieldId}-type`} className={`block mb-1 font-medium ${LABEL_SM}`}>종류</label>
          <select
            id={`${fieldId}-type`}
            className={`${INPUT_SM} w-full`}
            value={draft.card_type}
            onChange={(e) => setCardDraft((d) => ({ ...d, card_type: e.target.value as CardType }))}
          >
            <option value="credit">{CARD_TYPE_LABEL.credit}</option>
            <option value="debit">{CARD_TYPE_LABEL.debit}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${fieldId}-account`} className={`block mb-1 font-medium ${LABEL_SM}`}>결제계좌</label>
          <select
            id={`${fieldId}-account`}
            className={`${INPUT_SM} w-full`}
            value={draft.payment_account_id}
            onChange={(e) => setCardDraft((d) => ({ ...d, payment_account_id: e.target.value }))}
          >
            <option value="">(선택 안 함)</option>
            {accounts.map(({ account }) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            이 카드로 쓴 돈은 신용카드도 쓴 날 결제계좌 잔액에서 빠져요
          </p>
        </div>
        {unlinkedCount > 0 && draft.payment_account_id && (
          <label className={`flex items-start gap-2 ${LABEL_SM}`}>
            <input
              type="checkbox"
              className="mt-0.5"
              checked={draft.apply_to_unlinked}
              onChange={(e) => setCardDraft((d) => ({ ...d, apply_to_unlinked: e.target.checked }))}
            />
            <span>
              결제계좌 없이 기록된 이 카드의 지난 거래 {unlinkedCount}건에도 적용
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                적용하면 그 계좌 잔액이 지난 카드 사용액만큼 줄어요
              </span>
            </span>
          </label>
        )}
        <OwnerSelect
          value={draft.owner_user_id}
          onChange={(owner_user_id) => setCardDraft((d) => ({ ...d, owner_user_id }))}
          users={users}
        />
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
