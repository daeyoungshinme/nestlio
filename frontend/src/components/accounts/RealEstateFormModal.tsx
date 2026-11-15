import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import AmountInput from "@/components/common/AmountInput";
import FormInput from "@/components/common/FormInput";
import GrowlioLinkSection from "@/components/accounts/GrowlioLinkSection";
import Modal from "@/components/common/Modal";
import OwnerSelect from "@/components/common/OwnerSelect";
import { fetchGrowlioRealEstate } from "@/api/realEstate";
import { ASSET_RELATED_KEYS, QUERY_KEYS } from "@/constants/queryKeys";
import type { SavingsProductCreateIn, SavingsProductOut, UserOut } from "@/types";
import type { ProductBaseDraft } from "@/components/accounts/productDraft";

export type RealEstateDraft = ProductBaseDraft;

export const EMPTY_REAL_ESTATE_DRAFT: RealEstateDraft = { name: "", current_balance: "0", principal_amount: "", owner_user_id: "" };

/** 부동산은 저축상품(product_type="real_estate")으로 저장한다 — 월 저축액은 없다. */
export function toRealEstatePayload(draft: RealEstateDraft): SavingsProductCreateIn {
  return {
    name: draft.name,
    current_balance: draft.current_balance,
    monthly_saving_amount: "0",
    product_type: "real_estate",
    principal_amount: draft.principal_amount !== "" ? draft.principal_amount : null,
    owner_user_id: draft.owner_user_id || null,
  };
}

interface Props {
  initial: RealEstateDraft;
  /** 수정 중인 부동산 — 있으면 growlio 연동 칸을 보여준다. */
  product: SavingsProductOut | null;
  title: string;
  submitLabel: string;
  submitting: boolean;
  users: UserOut[] | undefined;
  onClose: () => void;
  onSubmit: (draft: RealEstateDraft) => void;
}

export default function RealEstateFormModal({ initial, product, title, submitLabel, submitting, users, onClose, onSubmit }: Props) {
  const [draft, setDraft] = useState<RealEstateDraft>(initial);

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
        <AmountInput
          label="현재 시세"
          value={draft.current_balance}
          onChange={(value) => setDraft((d) => ({ ...d, current_balance: value }))}
          className="w-full"
        />
        <AmountInput
          label="매입가 (선택)"
          value={draft.principal_amount}
          onChange={(value) => setDraft((d) => ({ ...d, principal_amount: value }))}
          className="w-full"
        />
        <OwnerSelect
          value={draft.owner_user_id}
          onChange={(owner_user_id) => setDraft((d) => ({ ...d, owner_user_id }))}
          users={users}
        />
        {product && (
          <GrowlioLinkSection
            productId={product.id}
            growlioAccountId={product.growlio_account_id}
            autoSyncEnabled={product.auto_sync_enabled}
            queryKey={QUERY_KEYS.growlioRealEstateAccounts}
            fetchRows={fetchGrowlioRealEstate}
            getRowId={(item) => item.id}
            getRowLabel={(item) => item.name}
            getRowAmount={(item) => item.market_value_krw}
            invalidateKeys={ASSET_RELATED_KEYS}
            onLinked={onClose}
          />
        )}
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
