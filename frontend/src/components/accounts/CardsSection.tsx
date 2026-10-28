import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import Button from "@/components/common/Button";
import AssetRow from "@/components/accounts/AssetRow";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import OwnerSelect from "@/components/common/OwnerSelect";
import QueryBoundary from "@/components/common/QueryBoundary";
import { createCard, deactivateCard, updateCard } from "@/api/cards";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { CARD_TYPE_LABEL } from "@/constants/transactions";
import { ASSET_RELATED_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { useAccounts, useCards } from "@/hooks/useReferenceData";
import { cautionTextClass } from "@/utils/colors";
import { resolveOwnerLabel } from "@/utils/format";
import type { AccountWithBalanceOut, CardCreateIn, CardType, CardUpdateIn, CardWithUsageOut, UserOut } from "@/types";

interface Draft {
  name: string;
  card_type: CardType;
  payment_account_id: string;
  owner_user_id: string;
  apply_to_unlinked: boolean;
}

const EMPTY_DRAFT: Draft = { name: "", card_type: "credit", payment_account_id: "", owner_user_id: "", apply_to_unlinked: false };

function draftFromCard({ card }: CardWithUsageOut): Draft {
  return {
    name: card.name,
    card_type: card.card_type,
    payment_account_id: card.payment_account?.is_active ? String(card.payment_account.id) : "",
    owner_user_id: card.owner_user_id ?? "",
    apply_to_unlinked: false,
  };
}

interface Props {
  users: UserOut[] | undefined;
}

/** 결제카드 목록 — 가계부에서 카드를 고르면 거래가 여기서 정한 결제계좌로 연결된다(신용카드도 사용일에 차감). */
export default function CardsSection({ users }: Props) {
  const cardsQuery = useCards();
  const { data: accounts = [] } = useAccounts();
  const [formTarget, setFormTarget] = useState<"new" | CardWithUsageOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);

  const { createMutation, updateMutation, removeMutation } = useCrudMutations<CardCreateIn, CardUpdateIn>({
    invalidateKeys: ASSET_RELATED_KEYS,
    api: { create: createCard, update: updateCard, remove: deactivateCard },
    messages: { create: "카드를 추가했습니다.", update: "저장했습니다.", remove: "카드를 비활성화했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  const handleSubmit = (draft: Draft) => {
    const payload = {
      name: draft.name,
      card_type: draft.card_type,
      payment_account_id: draft.payment_account_id ? Number(draft.payment_account_id) : null,
      owner_user_id: draft.owner_user_id || null,
    };
    if (formTarget === "new") {
      createMutation.mutate(payload);
    } else if (formTarget !== null) {
      updateMutation.mutate({ id: formTarget.card.id, payload: { ...payload, apply_to_unlinked: draft.apply_to_unlinked } });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">결제카드</p>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
          카드 추가
        </Button>
      </div>
      <QueryBoundary query={cardsQuery} errorMessage="카드를 불러오지 못했어요">
        {(data) =>
          data.length === 0 ? (
            <EmptyState title="등록된 카드가 없어요" description="카드를 등록하면 가계부에서 카드만 골라도 결제계좌로 연결돼요" compact />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.map((row) => (
                <CardRow
                  key={row.card.id}
                  row={row}
                  users={users}
                  onEdit={() => setFormTarget(row)}
                  onDelete={() => setDeactivateTarget(row.card.id)}
                />
              ))}
            </div>
          )
        }
      </QueryBoundary>

      {formTarget && (
        <CardFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromCard(formTarget)}
          unlinkedCount={formTarget === "new" ? 0 : formTarget.unlinked_transaction_count}
          title={formTarget === "new" ? "카드 추가" : "카드 수정"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={createMutation.isPending || updateMutation.isPending}
          accounts={accounts}
          users={users}
          onClose={() => setFormTarget(null)}
          onSubmit={handleSubmit}
        />
      )}
      {deactivateTarget !== null && (
        <ConfirmModal
          message="이 카드를 비활성화할까요? 지난 거래의 카드 표시는 남아요."
          onConfirm={() => removeMutation.mutate(deactivateTarget)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}

function CardRow({
  row,
  users,
  onEdit,
  onDelete,
}: {
  row: CardWithUsageOut;
  users: UserOut[] | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { card, unlinked_transaction_count: unlinked } = row;
  const account = card.payment_account?.is_active ? card.payment_account : null;

  return (
    <AssetRow
      name={card.name}
      linked={false}
      meta={
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {CARD_TYPE_LABEL[card.card_type]} · {resolveOwnerLabel(card.owner_user_id, users)}
        </p>
      }
      amount={
        account ? (
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">결제계좌 {account.name}</p>
        ) : (
          <p className={`mt-1 text-sm ${cautionTextClass()}`}>
            결제계좌 미지정{unlinked > 0 ? ` · 계좌 없는 거래 ${unlinked}건` : ""}
          </p>
        )
      }
      onEdit={onEdit}
      onDelete={onDelete}
      deleteLabel="비활성화"
      menuAriaLabel={`${card.name} 작업 더 보기`}
    />
  );
}

function CardFormModal({
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
  initial: Draft;
  unlinkedCount: number;
  title: string;
  submitLabel: string;
  submitting: boolean;
  accounts: AccountWithBalanceOut[];
  users: UserOut[] | undefined;
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState<Draft>(initial);

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
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <div>
          <label htmlFor={`${fieldId}-type`} className={`block mb-1 font-medium ${LABEL_SM}`}>종류</label>
          <select
            id={`${fieldId}-type`}
            className={`${INPUT_SM} w-full`}
            value={draft.card_type}
            onChange={(e) => setDraft((d) => ({ ...d, card_type: e.target.value as CardType }))}
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
            onChange={(e) => setDraft((d) => ({ ...d, payment_account_id: e.target.value }))}
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
              onChange={(e) => setDraft((d) => ({ ...d, apply_to_unlinked: e.target.checked }))}
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
