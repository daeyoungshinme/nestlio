import { Link } from "react-router-dom";
import { Plus, Tag } from "lucide-react";
import AnnualCategoryBudgetProgress from "@/components/financialPlan/AnnualCategoryBudgetProgress";
import AnnualPlanItemRow from "@/components/financialPlan/AnnualPlanItemRow";
import SectionAchievementBar from "@/components/financialPlan/SectionAchievementBar";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { groupItemsByCategory } from "@/utils/categoryGroup";
import { formatKrw } from "@/utils/format";
import type {
  AnnualCategoryBudgetRowOut,
  AnnualPlanItemOut,
  AnnualPlanSectionSummaryOut,
  CashflowSection,
  CategoryOut,
  UserOut,
} from "@/types";

interface Props {
  sectionKey: CashflowSection;
  label: string;
  items: AnnualPlanItemOut[];
  sectionSummary: AnnualPlanSectionSummaryOut;
  users: UserOut[] | undefined;
  categories: CategoryOut[];
  categoryBudgetRows: AnnualCategoryBudgetRowOut[];
  onAddItem: () => void;
  onEditItem: (item: AnnualPlanItemOut) => void;
  onDeleteItem: (item: AnnualPlanItemOut) => void;
}

/** CashflowPlanSectionPanel의 연간 버전 — 반복거래 연동/할부/수입제안/소유자 소계는 연간 항목에
 * 해당 개념이 없어(AnnualPlanItemRow가 이미 그렇듯) 뺐다. 이번 달 계획 탭과 동일하게 Tabs로 한
 * 번에 섹션 하나만 보여주는 AnnualPlanPanel에서 쓰인다. */
export default function AnnualPlanSectionPanel({
  sectionKey,
  label,
  items,
  sectionSummary,
  users,
  categories,
  categoryBudgetRows,
  onAddItem,
  onEditItem,
  onDeleteItem,
}: Props) {
  const categoryGroups = groupItemsByCategory(items, categories);
  const showCategoryGroups = categoryGroups.length > 1;

  const renderItem = (item: AnnualPlanItemOut, showCategory: boolean) => (
    <AnnualPlanItemRow
      key={item.id}
      item={item}
      users={users}
      showCategory={showCategory}
      onEdit={() => onEditItem(item)}
      onDelete={() => onDeleteItem(item)}
    />
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
            연간 {formatKrw(sectionSummary.annual_target)}
          </span>
          {sectionKey !== "income" && (
            <Link
              to="/categories"
              className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors`}
              aria-label="카테고리 관리"
              title="카테고리 관리"
            >
              <Tag size={16} />
            </Link>
          )}
          <button
            onClick={onAddItem}
            className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors`}
            aria-label={`${label} 항목 추가`}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <SectionAchievementBar label={label} summary={sectionSummary} />

      <div>
        {showCategoryGroups
          ? categoryGroups.map((group) => {
              const groupTotal = group.items.reduce((sum, item) => sum + Number(item.annual_target), 0);
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
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">카테고리별 연간 예산 사용</h4>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 mb-2">
            위 항목들에 태깅된 카테고리의 올해 예산 대비 실제 지출이에요.
          </p>
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {categoryBudgetRows.map((row) => (
              <AnnualCategoryBudgetProgress key={row.category_id} row={row} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
