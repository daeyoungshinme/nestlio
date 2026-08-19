import { Link } from "react-router-dom";
import { Layers, Plus, Tag } from "lucide-react";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import CashflowPlanItemRow from "@/components/financialPlan/CashflowPlanItemRow";
import SectionAchievementBar from "@/components/financialPlan/SectionAchievementBar";
import CategoryBudgetProgress from "@/components/financialPlan/CategoryBudgetProgress";
import { groupItemsByCategory } from "@/utils/categoryGroup";
import { formatKrw } from "@/utils/format";
import type {
  BudgetRowOut,
  CashflowPlanItemOut,
  CashflowPlanSectionSummaryOut,
  CashflowSection,
  CategoryOut,
  UserOut,
} from "@/types";

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
      if (amount > 0) ownerSubtotalParts.push(`${u.display_name} ${formatKrw(amount)}`);
    }
    const commonAmount = ownerTotals.get("") ?? 0;
    if (commonAmount > 0) ownerSubtotalParts.push(`공통 ${formatKrw(commonAmount)}`);
  }

  const categoryGroups = groupItemsByCategory(items, categories);
  const showCategoryGroups = categoryGroups.length > 1;

  const renderItem = (item: CashflowPlanItemOut, showCategory: boolean) => (
    <CashflowPlanItemRow
      key={item.id ?? `annual-${item.annual_plan_item_id}`}
      item={item}
      sectionKey={sectionKey}
      users={users}
      showCategory={showCategory}
      onEdit={() => onEditItem(item)}
      onDelete={() => onDeleteItem(item)}
      onLinkRecurring={() => onLinkRecurring(item)}
      onQuickAdd={() => onQuickAdd(item)}
    />
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
            계획 {formatKrw(sectionSummary.planned)}
          </span>
          {sectionKey === "irregular" && (
            <button
              onClick={onSplit}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
              aria-label="할부로 등록"
              title="할부로 등록"
            >
              <Layers size={16} />
            </button>
          )}
          {sectionKey !== "income" && (
            <Link
              to="/categories"
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
              aria-label="카테고리 관리"
              title="카테고리 관리 — 여기서 태깅할 카테고리를 추가/수정할 수 있어요"
            >
              <Tag size={16} />
            </Link>
          )}
          <button
            onClick={onAddItem}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
            aria-label={`${label} 항목 추가`}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      {ownerSubtotalParts.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{ownerSubtotalParts.join(" · ")}</p>
      )}
      <SectionAchievementBar label={label} summary={sectionSummary} />
      {showIncomeSuggestion && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 dark:bg-amber-950 px-2 py-1.5">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            최근 3개월 평균 수입은 {formatKrw(sectionSummary.suggested_amount!)}이에요.
            {nextYearMonthLabel ? ` ${nextYearMonthLabel} 계획에 반영해볼까요?` : ""}
          </p>
          {onApplyIncomeSuggestion && (
            <Button
              variant="secondary"
              size="sm"
              className="shrink-0 !min-h-0 !py-1 !px-2 text-xs"
              loading={applyingIncomeSuggestion}
              onClick={() => onApplyIncomeSuggestion(items[0], sectionSummary.suggested_amount!)}
            >
              다음 달에 반영
            </Button>
          )}
        </div>
      )}
      <div>
        {showCategoryGroups
          ? categoryGroups.map((group) => {
              const groupTotal = group.items.reduce((sum, item) => sum + Number(item.amount), 0);
              return (
                <CollapsibleGroup
                  key={group.category_id ?? "uncategorized"}
                  header={
                    <>
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: group.category_color ?? "#9ca3af" }}
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
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">등록된 항목이 없습니다.</p>
        )}
      </div>
      {categoryBudgetRows.length > 0 && (
        <div className="mt-4 pt-4 border-t-2 border-gray-100 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">카테고리별 예산 사용</h4>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 mb-2">
            위 항목들에 태깅된 카테고리의 이번 달 예산 대비 실제 지출이에요.
          </p>
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
