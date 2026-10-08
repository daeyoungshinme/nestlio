import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import OwnerSelect from "@/components/common/OwnerSelect";
import GrowlioLinkSection from "@/components/accounts/GrowlioLinkSection";
import { fetchGrowlioAccounts } from "@/api/savingsProducts";
import { ASSET_RELATED_KEYS, QUERY_KEYS } from "@/constants/queryKeys";
import { amountInputPreview, toAmountInputValue } from "@/utils/format";
import { savingsProductTypeLabel } from "@/utils/colors";
import type { SavingsProductOut, SavingsProductType, UserOut } from "@/types";

/** 저축·투자 상품 추가/수정 폼 — 자산 탭(SavingsProductsSection)과 계획 탭 저축·투자 섹션(SavingsInvestmentPlanPanel)이
 * 공유한다. 계획을 세우다가 상품이 없어 자산 탭으로 왕복하지 않도록 계획 탭에서도 바로 추가할 수 있게 분리했다. */

export interface Draft {
  name: string;
  current_balance: string;
  monthly_saving_amount: string;
  product_type: SavingsProductType;
  principal_amount: string;
  owner_user_id: string;
}

export const EMPTY_PRODUCT_DRAFT: Draft = {
  name: "",
  current_balance: "0",
  monthly_saving_amount: "0",
  product_type: "savings",
  principal_amount: "",
  owner_user_id: "",
};
export const PRODUCT_TYPES: SavingsProductType[] = ["savings", "investment", "emergency_fund"];

export function draftFromProduct(product: SavingsProductOut): Draft {
  return {
    name: product.name,
    current_balance: toAmountInputValue(product.current_balance),
    monthly_saving_amount: toAmountInputValue(product.monthly_saving_amount),
    product_type: product.product_type,
    principal_amount: product.principal_amount !== null ? toAmountInputValue(product.principal_amount) : "",
    owner_user_id: product.owner_user_id ?? "",
  };
}

export function toSavingsProductPayload(draft: Draft) {
  return {
    name: draft.name,
    current_balance: draft.current_balance,
    monthly_saving_amount: draft.monthly_saving_amount,
    product_type: draft.product_type,
    principal_amount:
      draft.product_type !== "savings" && draft.principal_amount !== "" ? draft.principal_amount : null,
    owner_user_id: draft.owner_user_id || null,
  };
}

export default function SavingsProductFormModal({
  initial,
  product,
  title,
  submitLabel,
  submitting,
  users,
  onClose,
  onSubmit,
}: {
  initial: Draft;
  product: SavingsProductOut | null;
  title: string;
  submitLabel: string;
  submitting: boolean;
  users: UserOut[] | undefined;
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit(draft);
  };

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
        <div>
          <label className="block mb-1 font-medium text-sm text-gray-700 dark:text-gray-300">유형</label>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
            {PRODUCT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, product_type: type }))}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  draft.product_type === type
                    ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-50"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {savingsProductTypeLabel(type)}
              </button>
            ))}
          </div>
        </div>
        <FormInput
          label="상품명"
          value={draft.name}
          maxLength={100}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <FormInput
          label="현재 적립된 금액"
          type="number"
          inputMode="decimal"
          value={draft.current_balance}
          onChange={(e) => setDraft((d) => ({ ...d, current_balance: e.target.value }))}
          className="w-full"
          preview={amountInputPreview(draft.current_balance)}
        />
        {!product && (
          <FormInput
            label="월 저축액"
            type="number"
            inputMode="decimal"
            value={draft.monthly_saving_amount}
            onChange={(e) => setDraft((d) => ({ ...d, monthly_saving_amount: e.target.value }))}
            className="w-full"
            preview={amountInputPreview(draft.monthly_saving_amount)}
          />
        )}
        {draft.product_type === "investment" && (
          <FormInput
            label="투자 원금 (선택)"
            type="number"
            inputMode="decimal"
            value={draft.principal_amount}
            onChange={(e) => setDraft((d) => ({ ...d, principal_amount: e.target.value }))}
            className="w-full"
            preview={amountInputPreview(draft.principal_amount)}
          />
        )}
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
            queryKey={QUERY_KEYS.growlioInvestmentAccounts}
            fetchRows={fetchGrowlioAccounts}
            getRowId={(account) => account.id}
            getRowLabel={(account) => account.name}
            getRowAmount={(account) => account.current_value_krw}
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
