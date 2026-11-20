import { Plus } from "lucide-react";
import Button from "@/components/common/Button";
import AssetRow from "@/components/accounts/AssetRow";
import CardFormModal, { cardDraftFrom, EMPTY_CARD_DRAFT } from "@/components/accounts/CardFormModal";
import type { CardDraft } from "@/components/accounts/CardFormModal";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import QueryBoundary from "@/components/common/QueryBoundary";
import { createCard, deactivateCard, updateCard } from "@/api/cards";
import { CARD_TYPE_LABEL } from "@/constants/transactions";
import { useAssetSection } from "@/hooks/useAssetSection";
import { useAccounts, useCards } from "@/hooks/useReferenceData";
import { cautionTextClass } from "@/utils/colors";
import { resolveOwnerLabel } from "@/utils/format";
import type { CardCreateIn, CardUpdateIn, CardWithUsageOut, UserOut } from "@/types";

interface Props {
  users: UserOut[] | undefined;
}

/** 결제카드 목록 — 가계부에서 카드를 고르면 거래가 여기서 정한 결제계좌로 연결된다(신용카드도 사용일에 차감). */
export default function CardsSection({ users }: Props) {
  const cardsQuery = useCards();
  const { data: accounts = [] } = useAccounts();
  const section = useAssetSection<CardWithUsageOut, CardCreateIn, CardUpdateIn>({
    api: { create: createCard, update: updateCard, deactivate: deactivateCard },
    getId: (row) => row.card.id,
    messages: { create: "카드를 추가했습니다.", deactivate: "카드를 비활성화했습니다." },
  });
  const { editing } = section;

  const handleSubmit = (draft: CardDraft) => {
    const payload = {
      name: draft.name,
      card_type: draft.card_type,
      payment_account_id: draft.payment_account_id ? Number(draft.payment_account_id) : null,
      owner_user_id: draft.owner_user_id || null,
    };
    section.submit(payload, { ...payload, apply_to_unlinked: draft.apply_to_unlinked });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">결제카드</p>
        <Button size="sm" icon={<Plus size={14} />} onClick={section.openNew}>
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
                  onEdit={() => section.openEdit(row)}
                  onDelete={() => section.askDeactivate(row)}
                />
              ))}
            </div>
          )
        }
      </QueryBoundary>

      {section.formTarget && (
        <CardFormModal
          initial={editing ? cardDraftFrom(editing) : EMPTY_CARD_DRAFT}
          unlinkedCount={editing ? editing.unlinked_transaction_count : 0}
          title={section.isNew ? "카드 추가" : "카드 수정"}
          submitLabel={section.isNew ? "추가" : "저장"}
          submitting={section.isSaving}
          accounts={accounts}
          users={users}
          onClose={section.closeForm}
          onSubmit={handleSubmit}
        />
      )}
      {section.deactivateTarget !== null && (
        <ConfirmModal
          message="이 카드를 비활성화할까요? 지난 거래의 카드 표시는 남아요."
          loading={section.deactivating}
          onConfirm={section.confirmDeactivate}
          onCancel={section.cancelDeactivate}
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
