import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import RowActionButtons from "@/components/common/RowActionButtons";
import SkeletonCard from "@/components/common/SkeletonCard";
import { INLINE_BUTTON_OFFSET, INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { createAccount, deactivateAccount, fetchAccounts } from "@/api/accounts";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { formatKrw, formatKrwPreview } from "@/utils/format";
import type { AccountOut } from "@/types";

const ACCOUNT_TYPE_LABEL: Record<AccountOut["account_type"], string> = {
  bank: "은행",
  cash: "현금",
  card: "카드",
};

export default function AccountsSection() {
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", account_type: "bank" as AccountOut["account_type"], initial_balance: "0" });

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.accounts, queryFn: fetchAccounts });

  const { createMutation, removeMutation: deactivateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.accounts],
    api: { create: createAccount, remove: deactivateAccount },
    messages: { create: "계좌를 추가했습니다.", remove: "계좌를 비활성화했습니다." },
    onCreateSuccess: () => setForm({ name: "", account_type: "bank", initial_balance: "0" }),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">새 계좌 추가</h3>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-start gap-3">
          <FormInput
            label="이름"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            className="w-40"
          />
          <div>
            <label className={`block mb-1 font-medium ${LABEL_SM}`}>종류</label>
            <select
              className={`${INPUT_SM} w-28`}
              value={form.account_type}
              onChange={(e) => setForm((f) => ({ ...f, account_type: e.target.value as AccountOut["account_type"] }))}
            >
              <option value="bank">은행</option>
              <option value="cash">현금</option>
              <option value="card">카드</option>
            </select>
          </div>
          <FormInput
            label="초기 잔액"
            type="number"
            inputMode="decimal"
            value={form.initial_balance}
            onChange={(e) => setForm((f) => ({ ...f, initial_balance: e.target.value }))}
            className="w-32"
            preview={Number(form.initial_balance) > 0 ? formatKrwPreview(Number(form.initial_balance)) : undefined}
          />
          <Button type="submit" loading={createMutation.isPending} className={INLINE_BUTTON_OFFSET}>
            추가
          </Button>
        </form>
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
              <RowActionButtons onDelete={() => setDeactivateTarget(account.id)} deleteLabel="비활성화" />
            </div>
          ))}
        </div>
      )}

      {deactivateTarget !== null && (
        <ConfirmModal
          message="이 계좌를 비활성화할까요?"
          onConfirm={() => deactivateMutation.mutate(deactivateTarget)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}
