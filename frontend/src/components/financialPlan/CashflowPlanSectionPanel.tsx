import { Link } from "react-router-dom";
import { Layers, Plus, Tag } from "lucide-react";
import CashflowPlanItemRow from "@/components/financialPlan/CashflowPlanItemRow";
import SectionAchievementBar from "@/components/financialPlan/SectionAchievementBar";
import CategoryBudgetProgress from "@/components/financialPlan/CategoryBudgetProgress";
import { formatKrw } from "@/utils/format";
import type { BudgetRowOut, CashflowPlanItemOut, CashflowPlanSectionSummaryOut, CashflowSection, UserOut } from "@/types";

interface Props {
  sectionKey: CashflowSection;
  label: string;
  items: CashflowPlanItemOut[];
  sectionSummary: CashflowPlanSectionSummaryOut;
  users: UserOut[] | undefined;
  budgetRowByCategory: Map<number, BudgetRowOut>;
  onAddItem: () => void;
  onSplit: () => void;
  onEditItem: (item: CashflowPlanItemOut) => void;
  onDeleteItem: (item: CashflowPlanItemOut) => void;
  onLinkRecurring: (item: CashflowPlanItemOut) => void;
  onQuickAdd: (item: CashflowPlanItemOut) => void;
}

export default function CashflowPlanSectionPanel({
  sectionKey,
  label,
  items,
  sectionSummary,
  users,
  budgetRowByCategory,
  onAddItem,
  onSplit,
  onEditItem,
  onDeleteItem,
  onLinkRecurring,
  onQuickAdd,
}: Props) {
  const categoryBudgetRows =
    sectionKey === "income"
      ? []
      : Array.from(budgetRowByCategory.values()).filter(
          (row) => row.type === sectionKey && Number(row.budget) > 0,
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
      <SectionAchievementBar label={label} summary={sectionSummary} />
      <div>
        {items.map((item) => (
          <CashflowPlanItemRow
            key={item.id}
            item={item}
            sectionKey={sectionKey}
            users={users}
            onEdit={() => onEditItem(item)}
            onDelete={() => onDeleteItem(item)}
            onLinkRecurring={() => onLinkRecurring(item)}
            onQuickAdd={() => onQuickAdd(item)}
          />
        ))}
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
              <CategoryBudgetProgress key={row.category_id} row={row} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
