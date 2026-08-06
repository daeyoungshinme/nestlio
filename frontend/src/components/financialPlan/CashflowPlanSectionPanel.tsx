import { Link } from "react-router-dom";
import { Layers, Plus, Tag } from "lucide-react";
import CashflowPlanItemRow from "@/components/financialPlan/CashflowPlanItemRow";
import ProgressBar from "@/components/common/ProgressBar";
import { formatKrw, formatPercent } from "@/utils/format";
import { planStatusBarClass, planStatusTextClass } from "@/utils/colors";
import type { BudgetRowOut, CashflowPlanItemOut, CashflowPlanSectionSummaryOut, CashflowSection, UserOut } from "@/types";

function SectionAchievement({ label, summary }: { label: string; summary: CashflowPlanSectionSummaryOut }) {
  if (summary.actual === null || summary.pct === null || summary.status === null) {
    return null;
  }
  return (
    <div className="mt-2 mb-1">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{label} 실적 {formatKrw(summary.actual)}</span>
        <span className={`font-semibold ${planStatusTextClass(summary.status)}`}>
          {formatPercent(summary.pct)} 달성
        </span>
      </div>
      <div className="mt-1">
        <ProgressBar pct={summary.pct} barClassName={planStatusBarClass(summary.status)} />
      </div>
    </div>
  );
}

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
      <SectionAchievement label={label} summary={sectionSummary} />
      <div>
        {items.map((item) => (
          <CashflowPlanItemRow
            key={item.id}
            item={item}
            sectionKey={sectionKey}
            users={users}
            budgetRow={item.category_id !== null ? budgetRowByCategory.get(item.category_id) : undefined}
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
    </div>
  );
}
