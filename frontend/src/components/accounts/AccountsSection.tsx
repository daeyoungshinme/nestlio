import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import GrowlioImportModal from "@/components/common/GrowlioImportModal";
import Modal from "@/components/common/Modal";
import RowActionButtons from "@/components/common/RowActionButtons";
import SkeletonCard from "@/components/common/SkeletonCard";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { createAccount, deactivateAccount, fetchAccounts, fetchGrowlioAccounts, importGrowlioAccounts, updateAccount } from "@/api/accounts";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { formatKrw, formatKrwPreview, toAmountInputValue } from "@/utils/format";
import type { AccountOut, AccountWithBalanceOut } from "@/types";

const ACCOUNT_TYPE_LABEL: Record<AccountOut["account_type"], string> = {
  bank: "은행",
  cash: "현금",
  card: "카드",
};

interface Draft {
  name: string;
  account_type: AccountOut["account_type"];
  /** 신규 등록 모드에서는 "초기 잔액", 수정 모드에서는 "현재 잔액"을 의미한다. */
  amount: string;
}

const EMPTY_DRAFT: Draft = { name: "", account_type: "bank", amount: "0" };

function draftFromAccount(row: AccountWithBalanceOut): Draft {
  return {
    name: row.account.name,
    account_type: row.account.account_type,
    amount: toAmountInputValue(row.balance),
  };
}

export default function AccountsSection() {
  const [formTarget, setFormTarget] = useState<"new" | AccountWithBalanceOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.accounts, queryFn: fetchAccounts });

  const { createMutation, updateMutation, removeMutation: deactivateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.accounts],
    api: { create: createAccount, update: updateAccount, remove: deactivateAccount },
    messages: { create: "계좌를 추가했습니다.", update: "저장했습니다.", remove: "계좌를 비활성화했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (draft: Draft) => {
    if (formTarget === "new") {
      createMutation.mutate({ name: draft.name, account_type: draft.account_type, initial_balance: draft.amount });
    } else if (formTarget) {
      updateMutation.mutate({
        id: formTarget.account.id,
        payload: { name: draft.name, account_type: draft.account_type, current_balance: draft.amount },
      });
    }
  };

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  const existingGrowlioAccountIds = new Set(
    data.map((row) => row.account.growlio_account_id).filter((id): id is string => !!id)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => setImportOpen(true)}>
          growlio에서 가져오기
        </Button>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
          계좌 추가
        </Button>
      </div>

      {data.length === 0 ? (
        <EmptyState title="등록된 계좌가 없어요" compact />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.map(({ account, balance }) => (
            <div key={account.id} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{account.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{ACCOUNT_TYPE_LABEL[account.account_type]}</p>
                <p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-50">{formatKrw(balance)}</p>
              </div>
              <RowActionButtons
                onEdit={() => setFormTarget({ account, balance })}
                onDelete={() => setDeactivateTarget(account.id)}
                deleteLabel="비활성화"
              />
            </div>
          ))}
        </div>
      )}

      {formTarget && (
        <AccountFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromAccount(formTarget)}
          title={formTarget === "new" ? "계좌 추가" : "계좌 수정"}
          amountLabel={formTarget === "new" ? "초기 잔액" : "현재 잔액"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={isSaving}
          onClose={() => setFormTarget(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deactivateTarget !== null && (
        <ConfirmModal
          message="이 계좌를 비활성화할까요?"
          onConfirm={() => deactivateMutation.mutate(deactivateTarget)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}

      {importOpen && (
        <GrowlioImportModal
          title="growlio 계좌 가져오기"
          queryKey={QUERY_KEYS.growlioBankAccounts}
          fetchAccounts={fetchGrowlioAccounts}
          importAccounts={importGrowlioAccounts}
          existingGrowlioAccountIds={existingGrowlioAccountIds}
          invalidateKeys={[QUERY_KEYS.accounts]}
          getAmount={(account) => account.initial_balance}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

function AccountFormModal({
  initial,
  title,
  amountLabel,
  submitLabel,
  submitting,
  onClose,
  onSubmit,
}: {
  initial: Draft;
  title: string;
  amountLabel: string;
  submitLabel: string;
  submitting: boolean;
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
        <FormInput
          label="이름"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>종류</label>
          <select
            className={`${INPUT_SM} w-full`}
            value={draft.account_type}
            onChange={(e) => setDraft((d) => ({ ...d, account_type: e.target.value as AccountOut["account_type"] }))}
          >
            <option value="bank">은행</option>
            <option value="cash">현금</option>
            <option value="card">카드</option>
          </select>
        </div>
        <FormInput
          label={amountLabel}
          type="number"
          inputMode="decimal"
          value={draft.amount}
          onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
          className="w-full"
          preview={Number(draft.amount) > 0 ? formatKrwPreview(Number(draft.amount)) : undefined}
        />
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
