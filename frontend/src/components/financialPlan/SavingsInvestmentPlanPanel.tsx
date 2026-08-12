import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Pencil, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import SkeletonCard from "@/components/common/SkeletonCard";
import Tabs from "@/components/common/Tabs";
import SectionAchievementBar from "@/components/financialPlan/SectionAchievementBar";
import {
  fetchSavingsProducts,
  fetchSavingsProductsAnnualPlan,
  fetchSavingsProductsPlan,
  syncSavingsProduct,
  updateSavingsProduct,
} from "@/api/savingsProducts";
import { INLINE_BUTTON_OFFSET } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { TOUCH_TARGET_MIN_HEIGHT, TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { formatKrw, formatKrwPreview, formatPercent, formatSyncedAt, toAmountInputValue } from "@/utils/format";
import { planStatusTextClass, savingsProductTypeBadgeStyle, savingsProductTypeLabel } from "@/utils/colors";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type {
  SavingsProductAnnualPlanGroupOut,
  SavingsProductAnnualPlanItemOut,
  SavingsProductOut,
  SavingsProductPlanGroupOut,
  SavingsProductPlanItemOut,
  SavingsProductUpdateIn,
} from "@/types";

const ACCOUNTS_SAVINGS_TAB_LINK = "/accounts?tab=저축·투자";
const VIEW_MODE_TABS = ["이번 달", "올해 누적"] as const;
type ViewMode = (typeof VIEW_MODE_TABS)[number];

interface NormalizedItem {
  id: number;
  name: string;
  product_type: "savings" | "investment";
  detailText: string;
  pct: number;
  status: "ok" | "warn" | "critical";
}

function normalizeMonthItem(item: SavingsProductPlanItemOut): NormalizedItem {
  return {
    id: item.id,
    name: item.name,
    product_type: item.product_type,
    detailText: `계획 ${formatKrw(item.planned)} · 이번 달 실제 ${formatKrw(item.actual)}`,
    pct: item.pct,
    status: item.status,
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
  };
}

function groupHeaderText(viewMode: ViewMode, summary: SavingsProductPlanGroupOut | SavingsProductAnnualPlanGroupOut) {
  if (viewMode === "이번 달") {
    return `계획 ${formatKrw((summary as SavingsProductPlanGroupOut).planned)}`;
  }
  const annual = summary as SavingsProductAnnualPlanGroupOut;
  return `연간목표 ${formatKrw(annual.annual_target)} · 지금까지 목표 ${formatKrw(annual.target_to_date)}`;
}

function ProductRow({
  item,
  product,
  yearMonth,
  year,
}: {
  item: NormalizedItem;
  product?: SavingsProductOut;
  yearMonth: string;
  year: number;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProductsPlan(yearMonth) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProductsAnnualPlan(year) });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProducts });
  };

  const updateMutation = useMutation({
    mutationFn: (payload: SavingsProductUpdateIn) => updateSavingsProduct(item.id, payload),
    onSuccess: () => {
      invalidate();
      toast("월 계획액을 저장했습니다.", "success");
      setIsEditing(false);
      setDraft(null);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncSavingsProduct(item.id),
    onSuccess: () => {
      invalidate();
      toast("growlio 잔액을 동기화했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const amountValue = draft ?? (product ? toAmountInputValue(product.monthly_saving_amount) : "");

  const handleCancel = () => {
    setDraft(null);
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!product) return;
    updateMutation.mutate({
      name: product.name,
      current_balance: product.current_balance,
      monthly_saving_amount: amountValue,
      product_type: product.product_type,
      principal_amount: product.principal_amount,
    });
  };

  return (
    <div className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium ${savingsProductTypeBadgeStyle(item.product_type)}`}
            >
              {savingsProductTypeLabel(item.product_type)}
            </span>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{item.name}</p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.detailText}</p>
          {product?.growlio_account_id && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              {product.last_synced_at ? `마지막 동기화 ${formatSyncedAt(product.last_synced_at)}` : "아직 동기화하지 않았어요"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {product && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              aria-label="월 계획액 수정"
              className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors`}
            >
              <Pencil size={14} />
            </button>
          )}
          {product?.growlio_account_id && (
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              aria-label="growlio 동기화"
              className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors disabled:opacity-50`}
            >
              <RefreshCw size={14} className={syncMutation.isPending ? "animate-spin" : ""} />
            </button>
          )}
          <span className={`text-sm font-semibold ${planStatusTextClass(item.status)}`}>{formatPercent(item.pct)}</span>
        </div>
      </div>
      {isEditing && (
        <div className="mt-2 flex items-start flex-wrap gap-2">
          <FormInput
            label="월 계획액"
            type="number"
            inputMode="decimal"
            value={amountValue}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full sm:w-40"
            preview={Number(amountValue) > 0 ? formatKrwPreview(Number(amountValue)) : undefined}
          />
          <div className={`flex gap-2 ${INLINE_BUTTON_OFFSET}`}>
            <Button size="sm" loading={updateMutation.isPending} onClick={handleSave} className={TOUCH_TARGET_MIN_HEIGHT}>
              저장
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel} className={TOUCH_TARGET_MIN_HEIGHT}>
              취소
            </Button>
          </div>
        </div>
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
  yearMonth,
  year,
}: {
  label: string;
  summary: SavingsProductPlanGroupOut | SavingsProductAnnualPlanGroupOut;
  headerValueText: string;
  items: NormalizedItem[];
  productById: Map<number, SavingsProductOut>;
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
          <ProductRow key={item.id} item={item} product={productById.get(item.id)} yearMonth={yearMonth} year={year} />
        ))}
      </div>
    </div>
  );
}

export default function SavingsInvestmentPlanPanel({ yearMonth }: { yearMonth: string }) {
  const [viewMode, setViewMode] = useState<ViewMode>("이번 달");
  const year = Number(yearMonth.slice(0, 4));

  const { data: monthData, isLoading: isMonthLoading } = useQuery({
    queryKey: QUERY_KEYS.savingsProductsPlan(yearMonth),
    queryFn: () => fetchSavingsProductsPlan(yearMonth),
    enabled: viewMode === "이번 달",
  });
  const { data: annualData, isLoading: isAnnualLoading } = useQuery({
    queryKey: QUERY_KEYS.savingsProductsAnnualPlan(year),
    queryFn: () => fetchSavingsProductsAnnualPlan(year),
    enabled: viewMode === "올해 누적",
  });
  const { data: products } = useQuery({
    queryKey: QUERY_KEYS.savingsProducts,
    queryFn: fetchSavingsProducts,
  });

  const isMonthMode = viewMode === "이번 달";
  const isLoading = isMonthMode ? isMonthLoading || !monthData : isAnnualLoading || !annualData;

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
      <Tabs tabs={VIEW_MODE_TABS} activeTab={viewMode} onChange={setViewMode} variant="pill" />

      <p className="text-xs text-gray-400 dark:text-gray-500">
        {isMonthMode
          ? "자산현황에 등록된 저축/투자 상품의 월 저축액(계획)과 이번 달 가계부에 기록된 실제 납입액을 비교해요. 월 계획액 수정과 growlio 동기화는 여기서 바로 할 수 있고, 상품 추가나 growlio 연동 설정은 자산현황에서 해요."
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
            headerValueText={groupHeaderText(viewMode, savingsSummary)}
            items={savingsItems}
            productById={productById}
            yearMonth={yearMonth}
            year={year}
          />
          <TypeGroup
            label="투자"
            summary={investmentSummary}
            headerValueText={groupHeaderText(viewMode, investmentSummary)}
            items={investmentItems}
            productById={productById}
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
