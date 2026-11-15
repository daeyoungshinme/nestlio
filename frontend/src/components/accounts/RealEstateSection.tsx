import AssetRow from "@/components/accounts/AssetRow";
import AssetSectionShell from "@/components/accounts/AssetSectionShell";
import RealEstateFormModal, { EMPTY_REAL_ESTATE_DRAFT, toRealEstatePayload, type RealEstateDraft } from "@/components/accounts/RealEstateFormModal";
import { ProductBadges, ReturnAmountText, goalsLinkedToProduct, growlioIdSet } from "@/components/accounts/productRowParts";
import GrowlioImportModal from "@/components/common/GrowlioImportModal";
import QueryBoundary from "@/components/common/QueryBoundary";
import InlineStatsBar from "@/components/common/InlineStatsBar";
import { createSavingsProduct, deactivateSavingsProduct, updateSavingsProduct } from "@/api/savingsProducts";
import { fetchGrowlioRealEstate, importGrowlioRealEstate, syncRealEstate } from "@/api/realEstate";
import { ASSET_RELATED_KEYS, QUERY_KEYS } from "@/constants/queryKeys";
import { useAssetSection } from "@/hooks/useAssetSection";
import { useGoals, useSavingsProducts } from "@/hooks/useReferenceData";
import { formatKrw, resolveOwnerLabel } from "@/utils/format";
import { cautionTextClass } from "@/utils/colors";
import type {
  FinancialGoalOut,
  RealEstateImportResultOut,
  SavingsProductCreateIn,
  SavingsProductOut,
  SavingsProductUpdateIn,
  UserOut,
} from "@/types";
import { baseDraftFromProduct } from "@/components/accounts/productDraft";
import { sumAmounts } from "@/utils/amount";

interface Props {
  users: UserOut[] | undefined;
}

export default function RealEstateSection({ users }: Props) {
  const savingsProductsQuery = useSavingsProducts();
  const { data: goals } = useGoals();
  const section = useAssetSection<SavingsProductOut, SavingsProductCreateIn, SavingsProductUpdateIn>({
    api: {
      create: createSavingsProduct,
      update: updateSavingsProduct,
      deactivate: deactivateSavingsProduct,
      sync: syncRealEstate,
    },
    getId: (product) => product.id,
    messages: { create: "부동산을 추가했습니다.", sync: "growlio 시세/담보대출을 동기화했습니다." },
  });

  const handleSubmit = (draft: RealEstateDraft) => {
    const payload = toRealEstatePayload(draft);
    section.submit(payload, payload);
  };

  return (
    <QueryBoundary query={savingsProductsQuery} errorMessage="부동산을 불러오지 못했어요">
      {(allData) => {
        const data = allData.filter((p) => p.product_type === "real_estate");

        const existingGrowlioAccountIds = growlioIdSet(data.map((p) => p.growlio_account_id));
        const rowsWithGain = data.filter((p) => p.return_amount !== null);
        const totalGain = sumAmounts(rowsWithGain, (p) => p.return_amount);

        return (
          <AssetSectionShell
            addLabel="부동산 추가"
            onAdd={section.openNew}
            onImport={section.openImport}
            isEmpty={data.length === 0}
            emptyTitle="등록된 부동산이 없어요"
            deactivateMessage="이 부동산을 비활성화할까요?"
            deactivateOpen={section.deactivateTarget !== null}
            onConfirmDeactivate={section.confirmDeactivate}
            deactivating={section.deactivating}
            onCancelDeactivate={section.cancelDeactivate}
            overlays={
              <>
                {section.formTarget && (
                  <RealEstateFormModal
                    initial={section.editing ? baseDraftFromProduct(section.editing) : EMPTY_REAL_ESTATE_DRAFT}
                    product={section.editing}
                    title={section.isNew ? "부동산 추가" : "부동산 수정"}
                    submitLabel={section.isNew ? "추가" : "저장"}
                    submitting={section.isSaving}
                    users={users}
                    onClose={section.closeForm}
                    onSubmit={handleSubmit}
                  />
                )}
                {section.importOpen && (
                  <GrowlioImportModal
                    title="부동산 가져오기"
                    queryKey={QUERY_KEYS.growlioRealEstateAccounts}
                    fetchRows={() => fetchGrowlioRealEstate().then((rows) => [...rows].sort((a, b) => a.name.localeCompare(b.name)))}
                    getRowId={(item) => item.id}
                    getRowAmount={(item) => item.market_value_krw}
                    renderRowMeta={(item) => ({
                      name: item.name,
                      badge: "부동산",
                      subtext: item.address,
                      amountNote: item.mortgage_balance_krw > 0 && (
                        <span className={`block text-[11px] ${cautionTextClass()}`}>
                          대출 {formatKrw(item.mortgage_balance_krw)}
                        </span>
                      ),
                    })}
                    importRows={importGrowlioRealEstate}
                    buildSuccessMessage={(results) => {
                      const total = sumAmounts(results, (r: RealEstateImportResultOut) => r.savings_product.current_balance);
                      const loanCount = results.filter((r) => r.loan !== null).length;
                      return (
                        `growlio 계좌 ${results.length}개를 가져왔습니다. 합계 ${formatKrw(total)}` +
                        (loanCount > 0 ? ` · 담보대출 ${loanCount}건도 함께 등록했어요.` : "")
                      );
                    }}
                    existingGrowlioAccountIds={existingGrowlioAccountIds}
                    invalidateKeys={ASSET_RELATED_KEYS}
                    onClose={section.closeImport}
                  />
                )}
              </>
            }
          >
            <div className="space-y-4">
              {rowsWithGain.length > 0 && (
                <InlineStatsBar
                  items={[
                    { label: "평가손익 합계", value: formatKrw(totalGain), tone: totalGain >= 0 ? "positive" : "negative" },
                  ]}
                />
              )}

              <div className="space-y-2">
                {data.map((product) => (
                  <RealEstateRow
                    key={product.id}
                    product={product}
                    users={users}
                    linkedGoals={goalsLinkedToProduct(goals, product.id)}
                    syncPending={section.syncPending}
                    onSync={() => section.sync(product)}
                    onEdit={() => section.openEdit(product)}
                    onDelete={() => section.askDeactivate(product)}
                  />
                ))}
              </div>
            </div>
          </AssetSectionShell>
        );
      }}
    </QueryBoundary>
  );
}

function RealEstateRow({
  product,
  users,
  linkedGoals,
  syncPending,
  onSync,
  onEdit,
  onDelete,
}: {
  product: SavingsProductOut;
  users: UserOut[] | undefined;
  linkedGoals: FinancialGoalOut[];
  syncPending: boolean;
  onSync: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <AssetRow
      name={product.name}
      linked={!!product.growlio_account_id}
      meta={
        <>
          <ProductBadges product={product} linkedGoals={linkedGoals} />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {resolveOwnerLabel(product.owner_user_id, users)}
            <ReturnAmountText product={product} label="매입가" />
          </p>
        </>
      }
      amount={<p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-50">{formatKrw(product.current_balance)}</p>}
      lastSyncedAt={product.last_synced_at}
      sync={{ onSync, pending: syncPending, label: "growlio 시세/담보대출 동기화" }}
      onEdit={onEdit}
      onDelete={onDelete}
      deleteLabel="비활성화"
      menuAriaLabel={`${product.name} 작업 더 보기`}
    />
  );
}
