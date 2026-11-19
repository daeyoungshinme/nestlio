import { useMemo, useState } from "react";
import SavingsProductRow from "@/components/accounts/SavingsProductRow";
import { goalsLinkedToProduct, growlioIdSet } from "@/components/accounts/productRowParts";
import AssetSectionShell from "@/components/accounts/AssetSectionShell";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import GrowlioImportModal from "@/components/common/GrowlioImportModal";
import QueryBoundary from "@/components/common/QueryBoundary";
import InlineStatsBar from "@/components/common/InlineStatsBar";
import { GROUP_THRESHOLD } from "@/constants/accounts";
import {
  createSavingsProduct,
  deactivateSavingsProduct,
  fetchGrowlioAccounts,
  importGrowlioAccounts,
  syncSavingsProduct,
  updateSavingsProduct,
} from "@/api/savingsProducts";
import { ASSET_RELATED_KEYS, QUERY_KEYS } from "@/constants/queryKeys";
import { useAssetSection } from "@/hooks/useAssetSection";
import { useGoals, useSavingsProducts } from "@/hooks/useReferenceData";
import { useSavingsProductsPlan } from "@/hooks/usePlanQueries";
import { currentYearMonth } from "@/utils/date";
import { formatKrw } from "@/utils/format";
import { savingsProductTypeDotClass, savingsProductTypeLabel } from "@/utils/colors";
import { growlioAssetTypeLabel } from "@/constants/growlio";
import type {
  SavingsProductCreateIn,
  SavingsProductOut,
  SavingsProductUpdateIn,
  UserOut,
} from "@/types";
import { sumAmounts } from "@/utils/amount";
import SavingsProductFormModal, {
  draftFromProduct,
  EMPTY_PRODUCT_DRAFT,
  PRODUCT_TYPES,
  toSavingsProductPayload,
  type Draft,
} from "@/components/accounts/SavingsProductFormModal";

interface Props {
  users: UserOut[] | undefined;
}

export default function SavingsProductsSection({ users }: Props) {
  const savingsProductsQuery = useSavingsProducts();
  const { data: goals } = useGoals();
  // "월 N원"은 상품의 폴백 필드(monthly_saving_amount)가 아니라 이번 달 실제 계획액(계획 탭의 월별 그리드가 있으면
  // 그 값)을 보여준다 — 계획 탭·목표 화면과 같은 숫자여야 한다(savings_product_plan_service.planned_by_product_for_month).
  const [thisMonth] = useState(currentYearMonth);
  const { data: productPlan } = useSavingsProductsPlan(thisMonth);
  const plannedById = useMemo(
    () => new Map((productPlan?.items ?? []).map((item) => [item.id, item.planned])),
    [productPlan],
  );
  // 계획을 불러오기 전(또는 실패)엔 null — 폴백 필드를 실제 계획처럼 보여주면 계획 탭과 숫자가 달라진다.
  // 계획을 불러온 뒤 목록에 없는 상품(계획 대상이 아닌 비상금 등)만 폴백 필드를 쓴다.
  const monthlyPlanOf = (product: SavingsProductOut): string | null =>
    productPlan ? (plannedById.get(product.id) ?? product.monthly_saving_amount) : null;

  const section = useAssetSection<SavingsProductOut, SavingsProductCreateIn, SavingsProductUpdateIn>({
    api: {
      create: createSavingsProduct,
      update: updateSavingsProduct,
      deactivate: deactivateSavingsProduct,
      sync: syncSavingsProduct,
    },
    getId: (product) => product.id,
    messages: { create: "저축/투자 상품을 추가했습니다.", sync: "growlio 잔액을 동기화했습니다." },
  });

  const handleSubmit = (draft: Draft) => {
    const payload = toSavingsProductPayload(draft);
    // 잔액을 직접 바꾸지 않았으면 보내지 않는다 — 폼을 연 사이 배우자가 기록한 납입을 옛 잔액으로 덮지 않게.
    const balanceUnchanged =
      section.editing !== null && draft.current_balance === draftFromProduct(section.editing).current_balance;
    const { current_balance: _unchanged, ...withoutBalance } = payload;
    section.submit(payload, balanceUnchanged ? withoutBalance : payload);
  };

  return (
    <QueryBoundary query={savingsProductsQuery} errorMessage="저축/투자 상품을 불러오지 못했어요">
      {(allData) => {
        // 부동산(product_type: "real_estate")은 별도 "부동산" 탭(RealEstateSection)에서 다루므로 여기서는 제외한다.
        const data = allData.filter((p) => p.product_type !== "real_estate");

        const existingGrowlioAccountIds = growlioIdSet(data.map((p) => p.growlio_account_id));
        const totalMonthly = productPlan ? sumAmounts(data, (p) => monthlyPlanOf(p) ?? "0") : null;
        const balanceByType = PRODUCT_TYPES.map((type) => ({
          type,
          rows: data.filter((p) => p.product_type === type),
          total: sumAmounts(data.filter((p) => p.product_type === type), (p) => p.current_balance),
        })).filter((entry) => entry.rows.length > 0);
        const shouldGroup = data.length >= GROUP_THRESHOLD;

        const renderRow = (product: SavingsProductOut) => (
          <SavingsProductRow
            key={product.id}
            product={product}
            monthlyPlan={monthlyPlanOf(product)}
            users={users}
            linkedGoals={goalsLinkedToProduct(goals, product.id)}
            syncPending={section.syncPending}
            onSync={() => section.sync(product)}
            onEdit={() => section.openEdit(product)}
            onDelete={() => section.askDeactivate(product)}
          />
        );

        return (
          <AssetSectionShell
            addLabel="상품 추가"
            onAdd={section.openNew}
            onImport={section.openImport}
            isEmpty={data.length === 0}
            emptyTitle="등록된 저축/투자 상품이 없어요"
            deactivateMessage="이 저축/투자 상품을 비활성화할까요?"
            deactivateOpen={section.deactivateTarget !== null}
            onConfirmDeactivate={section.confirmDeactivate}
            deactivating={section.deactivating}
            onCancelDeactivate={section.cancelDeactivate}
            overlays={
              <>
                {section.formTarget && (
                  <SavingsProductFormModal
                    initial={section.editing ? draftFromProduct(section.editing) : EMPTY_PRODUCT_DRAFT}
                    product={section.editing}
                    title={section.isNew ? "저축/투자 상품 추가" : "저축/투자 상품 수정"}
                    submitLabel={section.isNew ? "추가" : "저장"}
                    submitting={section.isSaving}
                    users={users}
                    onClose={section.closeForm}
                    onSubmit={handleSubmit}
                  />
                )}
                {section.importOpen && (
                  <GrowlioImportModal
                    title="투자 계좌 가져오기"
                    queryKey={QUERY_KEYS.growlioInvestmentAccounts}
                    fetchRows={() => fetchGrowlioAccounts().then((rows) => [...rows].sort((a, b) => a.name.localeCompare(b.name)))}
                    getRowId={(account) => account.id}
                    getRowAmount={(account) => account.current_value_krw}
                    renderRowMeta={(account) => ({ name: account.name, badge: growlioAssetTypeLabel(account.asset_type) })}
                    importRows={importGrowlioAccounts}
                    buildSuccessMessage={(created) => {
                      const total = sumAmounts(created, (p) => p.current_balance);
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
            <div className="space-y-4">
              <InlineStatsBar
                items={[
                  { label: "월 저축액 합계", value: totalMonthly !== null ? formatKrw(totalMonthly) : "—" },
                  ...(balanceByType.length > 1
                    ? balanceByType.map(({ type, total }) => ({
                        label: savingsProductTypeLabel(type),
                        value: formatKrw(total),
                      }))
                    : []),
                ]}
              />

              {shouldGroup ? (
                <div className="space-y-4">
                  {balanceByType.map(({ type, rows, total }) => (
                    <CollapsibleGroup
                      key={type}
                      header={
                        <>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${savingsProductTypeDotClass(type)}`} />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {savingsProductTypeLabel(type)} ({rows.length})
                          </span>
                        </>
                      }
                      amount={formatKrw(total)}
                      defaultOpen
                    >
                      {rows.map(renderRow)}
                    </CollapsibleGroup>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">{data.map(renderRow)}</div>
              )}
            </div>
          </AssetSectionShell>
        );
      }}
    </QueryBoundary>
  );
}
