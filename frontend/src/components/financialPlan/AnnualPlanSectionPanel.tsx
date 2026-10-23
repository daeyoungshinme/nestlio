import { Link } from "react-router-dom";
import { Plus, Tag } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import AnnualCategoryBudgetProgress from "@/components/financialPlan/AnnualCategoryBudgetProgress";
import AnnualPlanItemRow from "@/components/financialPlan/AnnualPlanItemRow";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import { ROUTES } from "@/constants/routes";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { groupItemsByCategory } from "@/utils/categoryGroup";
import { CATEGORY_SWATCH_FALLBACK_COLOR, cautionTextClass } from "@/utils/colors";
import { formatKrw, formatKrwCompact, formatPercent } from "@/utils/format";
import type {
  AnnualCategoryBudgetRowOut,
  AnnualPlanItemOut,
  AnnualPlanSectionSummaryOut,
  CashflowSection,
  CategoryOut,
  UserOut,
} from "@/types";
import { sumAmounts } from "@/utils/amount";

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

/** CashflowPlanSectionPanel의 연간 버전 — PlanSectionAccordion의 섹션 본문으로 쓰인다(섹션 이름·실적·달성률은
 * 아코디언 헤더가 보여주므로 여기선 연간 목표 합계와 항목 목록만). 반복거래 연동/할부/수입제안/소유자 소계는
 * 이번 달 화면에서 다룬다. */
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
  const hasOwnerSplit = items.some((item) => item.owner_user_id);
  const hasUncategorized = sectionKey !== "income" && items.some((item) => !item.category_name);
  const categoryGroups = groupItemsByCategory(items, categories);
  const showCategoryGroups = categoryGroups.length > 1;

  const renderItem = (item: AnnualPlanItemOut, showCategory: boolean) => (
    <AnnualPlanItemRow
      key={item.id}
      item={item}
      users={users}
      showCategory={showCategory}
      showOwner={hasOwnerSplit}
      onEdit={() => onEditItem(item)}
      onDelete={() => onDeleteItem(item)}
    />
  );

  return (
    <div>
      {/* 아코디언 헤더는 올해 지금까지(target_to_date) 기준이라, 연간 전체 목표는 여기서만 보인다. */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          연간 목표 {formatKrwCompact(Number(sectionSummary.annual_target))}
          {sectionSummary.annual_pct !== null && ` · ${formatPercent(sectionSummary.annual_pct)}`}
        </p>
        <div className="flex items-center gap-1">
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

      {hasUncategorized && (
        <p className={`text-xs mb-2 ${cautionTextClass()}`}>카테고리 미연결 항목은 실제 지출과 비교되지 않아요.</p>
      )}
      <div>
        {showCategoryGroups
          ? categoryGroups.map((group) => {
              const groupTotal = sumAmounts(group.items, (item) => item.annual_target);
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
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">카테고리별 연간 예산 사용</h4>
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
