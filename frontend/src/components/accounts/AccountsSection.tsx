import AssetRow from "@/components/accounts/AssetRow";
import AssetSectionShell from "@/components/accounts/AssetSectionShell";
import AccountFormModal, {
  ACCOUNT_TYPE_LABEL,
  ACCOUNT_TYPES,
  draftFromAccount,
  EMPTY_ACCOUNT_DRAFT,
  type AccountDraft,
} from "@/components/accounts/AccountFormModal";
import { growlioIdSet } from "@/components/accounts/productRowParts";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import GrowlioImportModal from "@/components/common/GrowlioImportModal";
import QueryBoundary from "@/components/common/QueryBoundary";
import InlineStatsBar from "@/components/common/InlineStatsBar";
import { growlioAssetTypeLabel } from "@/constants/growlio";
import { GROUP_THRESHOLD } from "@/constants/accounts";
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
import { formatKrw, resolveOwnerLabel } from "@/utils/format";
import type { AccountCreateIn, AccountUpdateIn, AccountWithBalanceOut, UserOut } from "@/types";
import { sumAmounts } from "@/utils/amount";

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
  const handleSubmit = (draft: AccountDraft) => {
    const base = { name: draft.name, account_type: draft.account_type, owner_user_id: draft.owner_user_id || null };
    section.submit({ ...base, initial_balance: draft.amount }, { ...base, current_balance: draft.amount });
  };

  return (
    <QueryBoundary query={accountsQuery} errorMessage="계좌를 불러오지 못했어요">
      {(data) => {
        const existingGrowlioAccountIds = growlioIdSet(data.map((row) => row.account.growlio_account_id));

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
            deactivating={section.deactivating}
            onCancelDeactivate={section.cancelDeactivate}
            overlays={
              <>
                {section.formTarget && (
                  <AccountFormModal
                    initial={section.editing ? draftFromAccount(section.editing) : EMPTY_ACCOUNT_DRAFT}
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
      lastSyncedAt={account.last_synced_at}
      sync={{ onSync, pending: syncPending }}
      onEdit={onEdit}
      onDelete={onDelete}
      deleteLabel="비활성화"
      menuAriaLabel={`${account.name} 작업 더 보기`}
    />
  );
}
