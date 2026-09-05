import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import Modal from "@/components/common/Modal";
import SkeletonCard from "@/components/common/SkeletonCard";
import StatusBadge from "@/components/common/StatusBadge";
import Tabs from "@/components/common/Tabs";
import SavingsProductAnnualPlanForm from "@/components/financialPlan/SavingsProductAnnualPlanForm";
import SectionAchievementBar from "@/components/financialPlan/SectionAchievementBar";
import {
  fetchSavingsProductAnnualPlanDetail,
  fetchSavingsProductsAnnualPlan,
  fetchSavingsProductsPlan,
  upsertSavingsProductAnnualPlan,
} from "@/api/savingsProducts";
import { useSavingsProducts, useUsers } from "@/hooks/useReferenceData";
import { accountsSectionLink, planViewLink } from "@/constants/routes";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { formatKrw, formatPercent } from "@/utils/format";
import {
  linkedGoalBadgeStyle,
  planStatusTextClass,
  savingsProductTypeBadgeStyle,
  savingsProductTypeLabel,
} from "@/utils/colors";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type {
  SavingsProductAnnualPlanGroupOut,
  SavingsProductAnnualPlanItemOut,
  SavingsProductOut,
  SavingsProductPlanGroupOut,
  SavingsProductPlanItemOut,
  UserOut,
} from "@/types";

const ACCOUNTS_SAVINGS_TAB_LINK = accountsSectionLink("저축·투자");
const VIEW_MODE_TABS = ["이번 달", "올해 누적"] as const;
type ViewMode = (typeof VIEW_MODE_TABS)[number];

interface NormalizedItem {
  id: number;
  name: string;
  product_type: "savings" | "investment";
  detailText: string;
  pct: number;
  status: "ok" | "warn" | "critical";
  /** "이번 달" 뷰에서만 존재 — 제안값(최근 3개월 평균)이 이미 계획액과 같은지 비교하는 데 쓰인다. */
  planned: string | null;
  suggestedMonthlySavingAmount: string | null;
}

function normalizeMonthItem(item: SavingsProductPlanItemOut): NormalizedItem {
  return {
    id: item.id,
    name: item.name,
    product_type: item.product_type,
    detailText: `계획 ${formatKrw(item.planned)} · 이번 달 실제 ${formatKrw(item.actual)}`,
    pct: item.pct,
    status: item.status,
    planned: item.planned,
    suggestedMonthlySavingAmount: item.suggested_monthly_saving_amount,
  };
}

function normalizeAnnualItem(item: SavingsProductAnnualPlanItemOut): NormalizedItem {
  return {
    id: item.id,
    name: item.name,
    product_type: item.product_type,
    detailText: `지금까지 목표 ${formatKrw(item.target_to_date)} · 올해 누적 ${formatKrw(item.actual)} (연간목표 ${formatKrw(item.annual_target)})`,
    pct: item.pct,
    status: item.status,
    planned: null,
    suggestedMonthlySavingAmount: null,
  };
}

function groupHeaderText(summary: SavingsProductPlanGroupOut | SavingsProductAnnualPlanGroupOut): string {
  // "annual_target"는 연간 뷰 그룹에만 있는 필드 — `in`으로 타입을 좁혀 캐스트 없이 분기한다.
  if ("annual_target" in summary) {
    return `연간목표 ${formatKrw(summary.annual_target)} · 지금까지 목표 ${formatKrw(summary.target_to_date)}`;
  }
  return `계획 ${formatKrw(summary.planned)}`;
}

function ProductRow({
  item,
  product,
  users,
  yearMonth,
  year,
}: {
  item: NormalizedItem;
  product?: SavingsProductOut;
  users: UserOut[] | undefined;
  yearMonth: string;
  year: number;
}) {
  const ownerLabel = product?.owner_user_id
    ? (users?.find((u) => u.id === product.owner_user_id)?.display_name ?? "공통")
    : "공통";

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProductsPlan(yearMonth) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProductsAnnualPlan(year) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProductAnnualPlanDetail(item.id, year) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProducts });
  };

  const { data: planDetail, isLoading: isPlanLoading } = useQuery({
    queryKey: QUERY_KEYS.savingsProductAnnualPlanDetail(item.id, year),
    queryFn: () => fetchSavingsProductAnnualPlanDetail(item.id, year),
    enabled: isPlanModalOpen,
  });

  const upsertPlanMutation = useMutation({
    mutationFn: (values: { start_month: string; end_month: string; monthly_targets: { year_month: string; target_amount: string }[] }) =>
      upsertSavingsProductAnnualPlan(item.id, { year, ...values }),
    onSuccess: () => {
      invalidate();
      toast("월별 계획을 저장했습니다.", "success");
      setIsPlanModalOpen(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const applySuggestionMutation = useMutation({
    mutationFn: async () => {
      const plan = await fetchSavingsProductAnnualPlanDetail(item.id, year);
      const monthlyTargets = plan.monthly_targets.map((t) =>
        t.year_month === yearMonth ? { ...t, target_amount: item.suggestedMonthlySavingAmount! } : t,
      );
      return upsertSavingsProductAnnualPlan(item.id, {
        year,
        start_month: plan.start_month,
        end_month: plan.end_month,
        monthly_targets: monthlyTargets,
      });
    },
    onSuccess: () => {
      invalidate();
      toast("제안값을 월 계획액에 반영했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const showSuggestion =
    product &&
    !product.monthly_saving_amount_synced &&
    item.status !== "ok" &&
    item.suggestedMonthlySavingAmount !== null &&
    item.planned !== null &&
    Number(item.suggestedMonthlySavingAmount) !== Number(item.planned);

  return (
    <div className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <StatusBadge
              size="chip"
              label={savingsProductTypeLabel(item.product_type)}
              toneClassName={savingsProductTypeBadgeStyle(item.product_type)}
              className="shrink-0"
            />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{item.name}</p>
            {product?.linked_goal_id !== null && product?.linked_goal_id !== undefined && (
              <StatusBadge
                size="chip"
                label={`목표: ${product.linked_goal_name}`}
                toneClassName={linkedGoalBadgeStyle()}
                className="shrink-0 max-w-[120px] truncate"
                title={
                  product.monthly_saving_amount_synced
                    ? `목표 "${product.linked_goal_name}"에서 월 계획액을 관리해요`
                    : `목표 "${product.linked_goal_name}"의 잔액 합산에 포함돼요`
                }
              />
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {ownerLabel} · {item.detailText}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {product && !product.monthly_saving_amount_synced && (
            <button
              onClick={() => setIsPlanModalOpen(true)}
              aria-label="월별 계획 편집"
              title="월별 계획 편집"
              className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors`}
            >
              <Pencil size={14} />
            </button>
          )}
          <span className={`text-sm font-semibold ${planStatusTextClass(item.status)}`}>{formatPercent(item.pct)}</span>
        </div>
      </div>
      {showSuggestion && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 dark:bg-amber-950 px-2 py-1.5">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            최근 3개월 평균 납입액은 {formatKrw(item.suggestedMonthlySavingAmount!)}이에요.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 !min-h-0 !py-1 !px-2 text-xs"
            loading={applySuggestionMutation.isPending}
            onClick={() => applySuggestionMutation.mutate()}
          >
            월 계획액에 반영
          </Button>
        </div>
      )}
      {isPlanModalOpen && (
        <Modal onClose={() => setIsPlanModalOpen(false)} title={`${item.name} 월별 계획 편집 (${year}년)`}>
          <div className="p-6 overflow-y-auto">
            {isPlanLoading || !planDetail ? (
              <SkeletonCard rows={3} />
            ) : (
              <SavingsProductAnnualPlanForm
                year={year}
                initialValues={{
                  start_month: planDetail.start_month,
                  end_month: planDetail.end_month,
                  monthly_targets: planDetail.monthly_targets,
                }}
                submitting={upsertPlanMutation.isPending}
                onSubmit={(values) => upsertPlanMutation.mutate(values)}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function TypeGroup({
  label,
  summary,
  headerValueText,
  items,
  productById,
  users,
  yearMonth,
  year,
}: {
  label: string;
  summary: SavingsProductPlanGroupOut | SavingsProductAnnualPlanGroupOut;
  headerValueText: string;
  items: NormalizedItem[];
  productById: Map<number, SavingsProductOut>;
  users: UserOut[] | undefined;
  yearMonth: string;
  year: number;
}) {
  if (items.length === 0) return null;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h3>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">{headerValueText}</span>
      </div>
      <SectionAchievementBar label={label} summary={summary} />
      <div>
        {items.map((item) => (
          <ProductRow
            key={item.id}
            item={item}
            product={productById.get(item.id)}
            users={users}
            yearMonth={yearMonth}
            year={year}
          />
        ))}
      </div>
    </div>
  );
}

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
  const year = Number(yearMonth.slice(0, 4));

  const {
    data: monthData,
    isLoading: isMonthLoading,
    isError: isMonthError,
    refetch: refetchMonth,
  } = useQuery({
    queryKey: QUERY_KEYS.savingsProductsPlan(yearMonth),
    queryFn: () => fetchSavingsProductsPlan(yearMonth),
    enabled: viewMode === "이번 달",
  });
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

  const otherViewLink = isMonthMode
    ? { to: planViewLink("연간"), label: "연간 누적 보기" }
    : { to: planViewLink("이번 달"), label: "이번 달 상세 보기" };

  return (
    <div className="space-y-4">
      {showViewToggle ? (
        <Tabs tabs={VIEW_MODE_TABS} activeTab={viewMode} onChange={setViewMode} variant="pill" />
      ) : (
        <Link
          to={otherViewLink.to}
          className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
        >
          {otherViewLink.label} <ArrowRight size={12} />
        </Link>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {isMonthMode
          ? "자산현황에 등록된 저축/투자 상품의 월 저축액(계획)과 이번 달 가계부에 기록된 실제 납입액을 비교해요. 월 계획액 수정은 여기서 바로 할 수 있고, 상품 추가·잔액 동기화는 자산현황에서 해요."
          : "연초부터 지금까지 계획대로 누적 납입했는지 비교해요. 특정 달을 거르고 다음 달에 몰아 넣어도 누적 기준으로는 계획대로 낸 것으로 반영돼요."}
      </p>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState title="등록된 저축/투자 상품이 없어요" compact />
          <div className="flex justify-center pb-2">
            <Link
              to={ACCOUNTS_SAVINGS_TAB_LINK}
              className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              자산현황에서 추가하기 <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <>
          <TypeGroup
            label="저축"
            summary={savingsSummary}
            headerValueText={groupHeaderText(savingsSummary)}
            items={savingsItems}
            productById={productById}
            users={users}
            yearMonth={yearMonth}
            year={year}
          />
          <TypeGroup
            label="투자"
            summary={investmentSummary}
            headerValueText={groupHeaderText(investmentSummary)}
            items={investmentItems}
            productById={productById}
            users={users}
            yearMonth={yearMonth}
            year={year}
          />
          <div className="flex justify-end">
            <Link
              to={ACCOUNTS_SAVINGS_TAB_LINK}
              className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
            >
              자산현황에서 관리하기 <ArrowRight size={14} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
