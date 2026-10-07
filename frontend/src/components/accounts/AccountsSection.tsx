import { useId, useState } from "react";
import type { FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import Button from "@/components/common/Button";
import AssetRow from "@/components/accounts/AssetRow";
import AssetSectionShell from "@/components/accounts/AssetSectionShell";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import FormInput from "@/components/common/FormInput";
import GrowlioImportModal from "@/components/common/GrowlioImportModal";
import Modal from "@/components/common/Modal";
import OwnerSelect from "@/components/common/OwnerSelect";
import QueryBoundary from "@/components/common/QueryBoundary";
import InlineStatsBar from "@/components/common/InlineStatsBar";
import { growlioAssetTypeLabel } from "@/constants/growlio";
import { GROUP_THRESHOLD } from "@/constants/accounts";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import {
  createAccount,
  deactivateAccount,
  fetchGrowlioAccounts,
  importGrowlioAccounts,
  syncAccount,
  updateAccount,
} from "@/api/accounts";
import { ASSET_RELATED_KEYS, QUERY_KEYS } from "@/constants/queryKeys";
import { useAssetSection } from "@/hooks/useAssetSection";
import { useAccounts } from "@/hooks/useReferenceData";
import { amountInputPreview, formatKrw, formatSyncedAt, resolveOwnerLabel, toAmountInputValue } from "@/utils/format";
import type { AccountCreateIn, AccountOut, AccountUpdateIn, AccountWithBalanceOut, UserOut } from "@/types";
import { sumAmounts } from "@/utils/amount";

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
  const accountsQuery = useAccounts();
  const section = useAssetSection<AccountWithBalanceOut, AccountCreateIn, AccountUpdateIn>({
    api: { create: createAccount, update: updateAccount, deactivate: deactivateAccount, sync: syncAccount },
    getId: (row) => row.account.id,
    messages: { create: "계좌를 추가했습니다.", deactivate: "계좌를 비활성화했습니다.", sync: "growlio 잔액을 동기화했습니다." },
  });

  // 생성은 "초기 잔액", 수정은 "현재 잔액"(서버가 initial_balance를 역산) — 같은 입력칸이 페이로드에선 다른 필드다.
  const handleSubmit = (draft: Draft) => {
    const base = { name: draft.name, account_type: draft.account_type, owner_user_id: draft.owner_user_id || null };
    section.submit({ ...base, initial_balance: draft.amount }, { ...base, current_balance: draft.amount });
  };

  return (
    <QueryBoundary query={accountsQuery} errorMessage="계좌를 불러오지 못했어요">
      {(data) => {
        const existingGrowlioAccountIds = new Set(
          data.map((row) => row.account.growlio_account_id).filter((id): id is string => !!id)
        );

        const balanceByType = ACCOUNT_TYPES.map((type) => ({
          type,
          rows: data.filter((row) => row.account.account_type === type),
          total: sumAmounts(
            data.filter((row) => row.account.account_type === type),
            (row) => row.balance,
          ),
        })).filter((entry) => entry.rows.length > 0);

        const totalBalance = sumAmounts(data, (row) => row.balance);

        const shouldGroup = data.length >= GROUP_THRESHOLD;

        const renderRow = (row: AccountWithBalanceOut) => (
          <AccountRow
            key={row.account.id}
            row={row}
            users={users}
            syncPending={section.syncPending}
            onSync={() => section.sync(row)}
            onEdit={() => section.openEdit(row)}
            onDelete={() => section.askDeactivate(row)}
          />
        );

        return (
          <AssetSectionShell
            className="space-y-6"
            addLabel="계좌 추가"
            onAdd={section.openNew}
            onImport={section.openImport}
            isEmpty={data.length === 0}
            emptyTitle="등록된 계좌가 없어요"
            deactivateMessage="이 계좌를 비활성화할까요?"
            deactivateOpen={section.deactivateTarget !== null}
            onConfirmDeactivate={section.confirmDeactivate}
            onCancelDeactivate={section.cancelDeactivate}
            overlays={
              <>
                {section.formTarget && (
                  <AccountFormModal
                    initial={section.editing ? draftFromAccount(section.editing) : EMPTY_DRAFT}
                    title={section.isNew ? "계좌 추가" : "계좌 수정"}
                    amountLabel={section.isNew ? "초기 잔액" : "현재 잔액"}
                    submitLabel={section.isNew ? "추가" : "저장"}
                    submitting={section.isSaving}
                    users={users}
                    onClose={section.closeForm}
                    onSubmit={handleSubmit}
                  />
                )}
                {section.importOpen && (
                  <GrowlioImportModal
                    title="growlio 계좌 가져오기"
                    queryKey={QUERY_KEYS.growlioBankAccounts}
                    fetchRows={fetchGrowlioAccounts}
                    getRowId={(account) => account.id}
                    getRowAmount={(account) => account.current_value_krw}
                    renderRowMeta={(account) => ({ name: account.name, badge: growlioAssetTypeLabel(account.asset_type) })}
                    importRows={importGrowlioAccounts}
                    buildSuccessMessage={(created) => {
                      const total = sumAmounts(created, (account) => account.initial_balance);
                      return `growlio 계좌 ${created.length}개를 가져왔습니다. 합계 ${formatKrw(total)}`;
                    }}
                    existingGrowlioAccountIds={existingGrowlioAccountIds}
                    invalidateKeys={ASSET_RELATED_KEYS}
                    onClose={section.closeImport}
                  />
                )}
              </>
            }
          >
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
          </AssetSectionShell>
        );
      }}
    </QueryBoundary>
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
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <div>
          <label htmlFor={`${fieldId}-0`} className={`block mb-1 font-medium ${LABEL_SM}`}>종류</label>
          <select
            id={`${fieldId}-0`}
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
          preview={amountInputPreview(draft.amount)}
        />
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
