import { Link } from "react-router-dom";
import { Layers, Plus, Tag } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import CashflowPlanItemRow from "@/components/financialPlan/CashflowPlanItemRow";
import CategoryBudgetProgress from "@/components/financialPlan/CategoryBudgetProgress";
import SuggestionHint from "@/components/financialPlan/SuggestionHint";
import { ROUTES } from "@/constants/routes";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { groupItemsByCategory } from "@/utils/categoryGroup";
import { CATEGORY_SWATCH_FALLBACK_COLOR, cautionTextClass } from "@/utils/colors";
import { formatKrw, formatKrwCompact } from "@/utils/format";
import type {
  BudgetRowOut,
  CashflowPlanItemOut,
  CashflowPlanSectionSummaryOut,
  CashflowSection,
  CategoryOut,
  UserOut,
} from "@/types";
import { sumAmounts } from "@/utils/amount";

interface Props {
  sectionKey: CashflowSection;
  label: string;
  items: CashflowPlanItemOut[];
  sectionSummary: CashflowPlanSectionSummaryOut;
  users: UserOut[] | undefined;
  categories: CategoryOut[];
  budgetRowByCategory: Map<number, BudgetRowOut>;
  nextYearMonthLabel?: string;
  onAddItem: () => void;
  onSplit: () => void;
  onEditItem: (item: CashflowPlanItemOut) => void;
  onDeleteItem: (item: CashflowPlanItemOut) => void;
  onLinkRecurring: (item: CashflowPlanItemOut) => void;
  onQuickAdd: (item: CashflowPlanItemOut) => void;
  onApplyCategorySuggestion?: (row: BudgetRowOut) => void;
  applyingCategoryId?: number | null;
  onApplyIncomeSuggestion?: (item: CashflowPlanItemOut, suggestedAmount: string) => void;
  applyingIncomeSuggestion?: boolean;
}

export default function CashflowPlanSectionPanel({
  sectionKey,
  label,
  items,
  sectionSummary,
  users,
  categories,
  budgetRowByCategory,
  nextYearMonthLabel,
  onAddItem,
  onSplit,
  onEditItem,
  onDeleteItem,
  onLinkRecurring,
  onQuickAdd,
  onApplyCategorySuggestion,
  applyingCategoryId,
  onApplyIncomeSuggestion,
  applyingIncomeSuggestion,
}: Props) {
  const showIncomeSuggestion =
    sectionKey === "income" &&
    sectionSummary.status !== null &&
    sectionSummary.status !== "ok" &&
    sectionSummary.suggested_amount !== null &&
    items.length === 1;
  const categoryBudgetRows =
    sectionKey === "income"
      ? []
      : Array.from(budgetRowByCategory.values()).filter(
          (row) => row.type === sectionKey && Number(row.budget) > 0,
        );

  const ownerTotals = new Map<string, number>();
  for (const item of items) {
    const key = item.owner_user_id ?? "";
    ownerTotals.set(key, (ownerTotals.get(key) ?? 0) + Number(item.amount));
  }
  const hasOwnerSplit = Array.from(ownerTotals.keys()).some((key) => key !== "");
  const ownerSubtotalParts: string[] = [];
  if (hasOwnerSplit) {
    for (const u of users ?? []) {
      const amount = ownerTotals.get(u.id) ?? 0;
      if (amount > 0) ownerSubtotalParts.push(`${u.display_name} ${formatKrwCompact(amount)}`);
    }
    const commonAmount = ownerTotals.get("") ?? 0;
    if (commonAmount > 0) ownerSubtotalParts.push(`공통 ${formatKrwCompact(commonAmount)}`);
  }

  const hasUncategorized = sectionKey !== "income" && items.some((item) => !item.category_name);
  const categoryGroups = groupItemsByCategory(items, categories);
  const showCategoryGroups = categoryGroups.length > 1;

  const renderItem = (item: CashflowPlanItemOut, showCategory: boolean) => (
    <CashflowPlanItemRow
      key={item.id}
      item={item}
      sectionKey={sectionKey}
      users={users}
      showCategory={showCategory}
      showOwner={hasOwnerSplit}
      onEdit={() => onEditItem(item)}
      onDelete={() => onDeleteItem(item)}
      onLinkRecurring={() => onLinkRecurring(item)}
      onQuickAdd={() => onQuickAdd(item)}
    />
  );

  return (
    <div>
      <div className="flex items-center justify-end mb-1">
        <div className="flex items-center gap-1">
          {sectionKey === "irregular" && (
            // 터치 기기엔 title 툴팁이 없어 아이콘만으로는 "할부 등록"을 찾을 수 없다 — 글자를 함께 둔다.
            <button
              type="button"
              onClick={onSplit}
              className={`${TOUCH_TARGET_MIN_HEIGHT} inline-flex items-center gap-1 px-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950 rounded-lg transition-colors`}
            >
              <Layers size={14} aria-hidden="true" />
              할부
            </button>
          )}
          {sectionKey !== "income" && (
            <Link
              to={ROUTES.categories}
              className={`${TOUCH_TARGET_MIN_HEIGHT} inline-flex items-center gap-1 px-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950 rounded-lg transition-colors`}
            >
              <Tag size={14} aria-hidden="true" />
              카테고리
            </Link>
          )}
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={onAddItem} aria-label={`${label} 항목 추가`}>
            항목 추가
          </Button>
        </div>
      </div>
      {ownerSubtotalParts.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{ownerSubtotalParts.join(" · ")}</p>
      )}
      {hasUncategorized && (
        <p className={`text-xs mb-2 ${cautionTextClass()}`}>카테고리 미연결 항목은 실제 지출과 비교되지 않아요.</p>
      )}
      {showIncomeSuggestion && (
        <SuggestionHint
          className="mb-2"
          actionLabel="다음 달에 반영"
          applying={applyingIncomeSuggestion}
          onApply={
            onApplyIncomeSuggestion && (() => onApplyIncomeSuggestion(items[0], sectionSummary.suggested_amount!))
          }
        >
          최근 3개월 평균 수입은 {formatKrw(sectionSummary.suggested_amount!)}이에요.
          {nextYearMonthLabel ? ` ${nextYearMonthLabel} 계획에 반영해볼까요?` : ""}
        </SuggestionHint>
      )}
      <div>
        {showCategoryGroups
          ? categoryGroups.map((group) => {
              const groupTotal = sumAmounts(group.items, (item) => item.amount);
              return (
                <CollapsibleGroup
                  key={group.category_id ?? "uncategorized"}
                  header={
                    <>
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: group.category_color ?? CATEGORY_SWATCH_FALLBACK_COLOR }}
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                        {group.category_name ?? "미분류"}
                      </span>
                    </>
                  }
                  amount={formatKrw(groupTotal)}
                  defaultOpen
                >
                  {group.items.map((item) => renderItem(item, false))}
                </CollapsibleGroup>
              );
            })
          : items.map((item) => renderItem(item, true))}
        {items.length === 0 && (
          <EmptyState title="등록된 항목이 없어요" compact />
        )}
      </div>
      {categoryBudgetRows.length > 0 && (
        <div className="mt-4 pt-4 border-t-2 border-gray-100 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">카테고리별 예산 사용</h4>
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {categoryBudgetRows.map((row) => (
              <CategoryBudgetProgress
                key={row.category_id}
                row={row}
                nextYearMonthLabel={nextYearMonthLabel}
                onApplySuggestion={onApplyCategorySuggestion}
                applyingCategoryId={applyingCategoryId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
