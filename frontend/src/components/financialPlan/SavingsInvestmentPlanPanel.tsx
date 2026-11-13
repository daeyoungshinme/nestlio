import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import SavingsProductFormModal, {
  EMPTY_PRODUCT_DRAFT,
  toSavingsProductPayload,
} from "@/components/accounts/SavingsProductFormModal";
import ErrorState from "@/components/common/ErrorState";
import SkeletonCard from "@/components/common/SkeletonCard";
import Tabs from "@/components/common/Tabs";
import SavingsPlanTypeGroup from "@/components/financialPlan/SavingsPlanTypeGroup";
import {
  groupHeaderText,
  normalizeAnnualItem,
  normalizeMonthItem,
  type NormalizedItem,
} from "@/components/financialPlan/savingsPlanItems";
import { createSavingsProduct, fetchSavingsProductsAnnualPlan } from "@/api/savingsProducts";
import { useSavingsProducts, useUsers } from "@/hooks/useReferenceData";
import { useSavingsProductsPlan } from "@/hooks/usePlanQueries";
import { accountsSectionLink } from "@/constants/routes";
import { ASSET_RELATED_KEYS, QUERY_KEYS } from "@/constants/queryKeys";
import { invalidateKeys } from "@/utils/queryClient";
import { yearOf } from "@/utils/date";
import { toast } from "@/utils/toast";

const ACCOUNTS_SAVINGS_TAB_LINK = accountsSectionLink("저축·투자");
const VIEW_MODE_TABS = ["이번 달", "올해 누적"] as const;
type ViewMode = (typeof VIEW_MODE_TABS)[number];

export default function SavingsInvestmentPlanPanel({
  yearMonth,
  initialViewMode = "이번 달",
  showViewToggle = true,
}: {
  yearMonth: string;
  /** 이번 달 계획/연간계획 화면에 임베드될 때 각 화면의 스코프(월/연)에 맞는 모드로 고정해서
   * 보여주기 위한 초깃값. showViewToggle=false면 이후에도 이 값으로 고정된다. */
  initialViewMode?: ViewMode;
  /** false면 뷰 토글 대신 반대쪽 뷰(연간계획 ↔ 이번 달 계획)로 가는 링크만 보여준다 — 같은
   * 저축상품 데이터를 두 화면에서 완전히 중복 열람하지 않도록, 각 화면은 자기 스코프의 뷰만
   * 보여주고 서로 링크로만 연결한다. */
  showViewToggle?: boolean;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [showCreate, setShowCreate] = useState(false);
  const year = yearOf(yearMonth);
  const queryClient = useQueryClient();
  // 계획을 세우다 상품이 없으면 자산 탭으로 왕복하지 않고 여기서 바로 만든다(자산 탭과 같은 폼).
  const createMutation = useMutation({
    mutationFn: createSavingsProduct,
    onSuccess: () => {
      invalidateKeys(queryClient, ASSET_RELATED_KEYS);
      setShowCreate(false);
      toast("저축/투자 상품을 추가했습니다.", "success");
    },
  });

  const {
    data: monthData,
    isLoading: isMonthLoading,
    isError: isMonthError,
    refetch: refetchMonth,
  } = useSavingsProductsPlan(yearMonth, { enabled: viewMode === "이번 달" });
  const {
    data: annualData,
    isLoading: isAnnualLoading,
    isError: isAnnualError,
    refetch: refetchAnnual,
  } = useQuery({
    queryKey: QUERY_KEYS.savingsProductsAnnualPlan(year),
    queryFn: () => fetchSavingsProductsAnnualPlan(year),
    enabled: viewMode === "올해 누적",
  });
  const { data: products } = useSavingsProducts();
  const { data: users } = useUsers();

  const isMonthMode = viewMode === "이번 달";
  const isLoading = isMonthMode ? isMonthLoading || !monthData : isAnnualLoading || !annualData;

  if (isMonthMode ? isMonthError : isAnnualError) {
    return <ErrorState onRetry={() => void (isMonthMode ? refetchMonth() : refetchAnnual())} />;
  }
  if (isLoading) {
    return <SkeletonCard rows={4} />;
  }

  const productById = new Map((products ?? []).map((p) => [p.id, p] as const));

  const items: NormalizedItem[] = isMonthMode
    ? monthData!.items.map(normalizeMonthItem)
    : annualData!.items.map(normalizeAnnualItem);
  const savingsSummary = isMonthMode ? monthData!.savings : annualData!.savings;
  const investmentSummary = isMonthMode ? monthData!.investment : annualData!.investment;
  const savingsItems = items.filter((i) => i.product_type === "savings");
  const investmentItems = items.filter((i) => i.product_type === "investment");

  return (
    <div className="space-y-4">
      {showViewToggle && <Tabs tabs={VIEW_MODE_TABS} activeTab={viewMode} onChange={setViewMode} variant="pill" />}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {isMonthMode
          ? "자산현황에 등록된 저축/투자 상품의 월 저축액(계획)과 이번 달 가계부에 기록된 실제 납입액을 비교해요. 상품 추가와 월 계획액 수정은 여기서 바로 하고, 잔액 동기화는 자산현황에서 해요."
          : "연초부터 지금까지 계획대로 누적 납입했는지 비교해요. 특정 달을 거르고 다음 달에 몰아 넣어도 누적 기준으로는 계획대로 낸 것으로 반영돼요."}
      </p>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState title="등록된 저축/투자 상품이 없어요" compact />
          <div className="flex justify-center pb-2">
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
              상품 추가
            </Button>
          </div>
        </div>
      ) : (
        <>
          <SavingsPlanTypeGroup
            label="저축"
            summary={savingsSummary}
            headerValueText={groupHeaderText(savingsSummary)}
            items={savingsItems}
            productById={productById}
            users={users}
            yearMonth={yearMonth}
            year={year}
          />
          <SavingsPlanTypeGroup
            label="투자"
            summary={investmentSummary}
            headerValueText={groupHeaderText(investmentSummary)}
            items={investmentItems}
            productById={productById}
            users={users}
            yearMonth={yearMonth}
            year={year}
          />
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
              상품 추가
            </Button>
            <Link
              to={ACCOUNTS_SAVINGS_TAB_LINK}
              className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
            >
              자산현황에서 관리하기 <ArrowRight size={14} />
            </Link>
          </div>
        </>
      )}

      {showCreate && (
        <SavingsProductFormModal
          initial={EMPTY_PRODUCT_DRAFT}
          product={null}
          title="저축/투자 상품 추가"
          submitLabel="추가"
          submitting={createMutation.isPending}
          users={users}
          onClose={() => setShowCreate(false)}
          onSubmit={(draft) => createMutation.mutate(toSavingsProductPayload(draft))}
        />
      )}
    </div>
  );
}
