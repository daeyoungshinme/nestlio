import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, RefreshCw } from "lucide-react";
import Button from "@/components/common/Button";
import AssetRow from "@/components/accounts/AssetRow";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import GrowlioImportModal from "@/components/common/GrowlioImportModal";
import Modal from "@/components/common/Modal";
import OwnerSelect from "@/components/accounts/OwnerSelect";
import SkeletonCard from "@/components/common/SkeletonCard";
import InlineStatsBar from "@/components/common/InlineStatsBar";
import { growlioAssetTypeLabel } from "@/constants/growlio";
import { GROUP_THRESHOLD } from "@/constants/accounts";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import {
  createAccount,
  deactivateAccount,
  fetchAccounts,
  fetchGrowlioAccounts,
  importGrowlioAccounts,
  syncAccount,
  updateAccount,
} from "@/api/accounts";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { formatKrw, formatKrwPreview, formatSyncedAt, resolveOwnerLabel, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { AccountOut, AccountWithBalanceOut, UserOut } from "@/types";

const ACCOUNT_TYPE_LABEL: Record<AccountOut["account_type"], string> = {
  bank: "은행",
  cash: "현금",
  card: "카드",
};

const ACCOUNT_TYPES: AccountOut["account_type"][] = ["bank", "cash", "card"];

interface Draft {
  name: string;
  account_type: AccountOut["account_type"];
  /** 신규 등록 모드에서는 "초기 잔액", 수정 모드에서는 "현재 잔액"을 의미한다. */
  amount: string;
  owner_user_id: string;
}

const EMPTY_DRAFT: Draft = { name: "", account_type: "bank", amount: "0", owner_user_id: "" };

function draftFromAccount(row: AccountWithBalanceOut): Draft {
  return {
    name: row.account.name,
    account_type: row.account.account_type,
    amount: toAmountInputValue(row.balance),
    owner_user_id: row.account.owner_user_id ?? "",
  };
}

interface Props {
  users: UserOut[] | undefined;
}

export default function AccountsSection({ users }: Props) {
  const [formTarget, setFormTarget] = useState<"new" | AccountWithBalanceOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: QUERY_KEYS.accounts, queryFn: fetchAccounts });

  const { createMutation, updateMutation, removeMutation: deactivateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.accounts],
    api: { create: createAccount, update: updateAccount, remove: deactivateAccount },
    messages: { create: "계좌를 추가했습니다.", update: "저장했습니다.", remove: "계좌를 비활성화했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  const syncMutation = useMutation({
    mutationFn: syncAccount,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accounts });
      toast("growlio 잔액을 동기화했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (draft: Draft) => {
    const owner_user_id = draft.owner_user_id || null;
    if (formTarget === "new") {
      createMutation.mutate({
        name: draft.name,
        account_type: draft.account_type,
        initial_balance: draft.amount,
        owner_user_id,
      });
    } else if (formTarget) {
      updateMutation.mutate({
        id: formTarget.account.id,
        payload: { name: draft.name, account_type: draft.account_type, current_balance: draft.amount, owner_user_id },
      });
    }
  };

  if (isError) {
    return (
      <EmptyState
        title="계좌를 불러오지 못했어요"
        description={extractErrorMessage(error)}
        action={{ label: "다시 시도", onClick: () => void refetch() }}
      />
    );
  }

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  const existingGrowlioAccountIds = new Set(
    data.map((row) => row.account.growlio_account_id).filter((id): id is string => !!id)
  );

  const balanceByType = ACCOUNT_TYPES.map((type) => ({
    type,
    rows: data.filter((row) => row.account.account_type === type),
    total: data
      .filter((row) => row.account.account_type === type)
      .reduce((sum, row) => sum + Number(row.balance), 0),
  })).filter((entry) => entry.rows.length > 0);

  const totalBalance = data.reduce((sum, row) => sum + Number(row.balance), 0);

  const shouldGroup = data.length >= GROUP_THRESHOLD;

  const renderRow = (row: AccountWithBalanceOut) => (
    <AccountRow
      key={row.account.id}
      row={row}
      users={users}
      syncPending={syncMutation.isPending}
      onSync={() => syncMutation.mutate(row.account.id)}
      onEdit={() => setFormTarget(row)}
      onDelete={() => setDeactivateTarget(row.account.id)}
    />
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
        <>
          <InlineStatsBar
            items={[
              { label: "전체 합계", value: formatKrw(totalBalance) },
              ...(balanceByType.length > 1
                ? balanceByType.map(({ type, total }) => ({ label: ACCOUNT_TYPE_LABEL[type], value: formatKrw(total) }))
                : []),
            ]}
          />

          {shouldGroup ? (
            <div className="space-y-4">
              {balanceByType.map(({ type, rows, total }) => (
                <CollapsibleGroup
                  key={type}
                  header={
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {ACCOUNT_TYPE_LABEL[type]} ({rows.length})
                    </span>
                  }
                  amount={formatKrw(total)}
                  defaultOpen
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{rows.map(renderRow)}</div>
                </CollapsibleGroup>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{data.map(renderRow)}</div>
          )}
        </>
      )}

      {formTarget && (
        <AccountFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromAccount(formTarget)}
          title={formTarget === "new" ? "계좌 추가" : "계좌 수정"}
          amountLabel={formTarget === "new" ? "초기 잔액" : "현재 잔액"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={isSaving}
          users={users}
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
          fetchRows={fetchGrowlioAccounts}
          getRowId={(account) => account.id}
          getRowAmount={(account) => account.current_value_krw}
          renderRowMeta={(account) => ({ name: account.name, badge: growlioAssetTypeLabel(account.asset_type) })}
          importRows={importGrowlioAccounts}
          buildSuccessMessage={(created) => {
            const total = created.reduce((sum, account) => sum + Number(account.initial_balance), 0);
            return `growlio 계좌 ${created.length}개를 가져왔습니다. 합계 ${formatKrw(total)}`;
          }}
          existingGrowlioAccountIds={existingGrowlioAccountIds}
          invalidateKeys={[QUERY_KEYS.accounts]}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

function AccountRow({
  row,
  users,
  syncPending,
  onSync,
  onEdit,
  onDelete,
}: {
  row: AccountWithBalanceOut;
  users: UserOut[] | undefined;
  syncPending: boolean;
  onSync: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { account, balance } = row;
  const ownerLabel = resolveOwnerLabel(account.owner_user_id, users);

  return (
    <AssetRow
      name={account.name}
      linked={!!account.growlio_account_id}
      meta={
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {ACCOUNT_TYPE_LABEL[account.account_type]} · {ownerLabel}
        </p>
      }
      amount={<p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-50">{formatKrw(balance)}</p>}
      syncedAtLabel={
        account.last_synced_at ? `마지막 동기화 ${formatSyncedAt(account.last_synced_at)}` : "아직 동기화하지 않았어요"
      }
      actions={
        account.growlio_account_id
          ? [
              {
                icon: <RefreshCw size={16} className={syncPending ? "animate-spin" : ""} />,
                label: syncPending ? "동기화 중…" : "growlio 동기화",
                onClick: onSync,
                disabled: syncPending,
              },
            ]
          : []
      }
      onEdit={onEdit}
      onDelete={onDelete}
      deleteLabel="비활성화"
      menuAriaLabel={`${account.name} 작업 더 보기`}
    />
  );
}

function AccountFormModal({
  initial,
  title,
  amountLabel,
  submitLabel,
  submitting,
  users,
  onClose,
  onSubmit,
}: {
  initial: Draft;
  title: string;
  amountLabel: string;
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
        <OwnerSelect
          value={draft.owner_user_id}
          onChange={(owner_user_id) => setDraft((d) => ({ ...d, owner_user_id }))}
          users={users}
        />
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
