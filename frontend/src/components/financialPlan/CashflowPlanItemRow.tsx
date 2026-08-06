import { Pencil, Repeat, Send, Trash2 } from "lucide-react";
import ProgressBar from "@/components/common/ProgressBar";
import { formatKrw, formatPercent } from "@/utils/format";
import { installmentProgressLabel } from "@/utils/installment";
import { planStatusBarClass, planStatusTextClass, recurringLinkBadgeLabel, recurringLinkBadgeStyle } from "@/utils/colors";
import type { BudgetRowOut, CashflowPlanItemOut, CashflowSection, UserOut } from "@/types";

function CategoryBudgetProgress({ row }: { row: BudgetRowOut }) {
  if (Number(row.budget) <= 0) return null;
  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>실제 {formatKrw(row.actual)} / 예산 {formatKrw(row.budget)}</span>
        <span className={`font-semibold ${planStatusTextClass(row.status)}`}>{formatPercent(row.pct)} 사용</span>
      </div>
      <div className="mt-1">
        <ProgressBar pct={row.pct} barClassName={planStatusBarClass(row.status)} />
      </div>
    </div>
  );
}

interface Props {
  item: CashflowPlanItemOut;
  sectionKey: CashflowSection;
  users: UserOut[] | undefined;
  budgetRow: BudgetRowOut | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onLinkRecurring: () => void;
  onQuickAdd: () => void;
}

export default function CashflowPlanItemRow({
  item,
  sectionKey,
  users,
  budgetRow,
  onEdit,
  onDelete,
  onLinkRecurring,
  onQuickAdd,
}: Props) {
  const ownerLabel = item.owner_user_id
    ? (users?.find((u) => u.id === item.owner_user_id)?.display_name ?? "공통")
    : "공통";

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
          {item.name}
          {item.installment_total !== null && (
            <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
              ({item.installment_no}/{item.installment_total})
            </span>
          )}
        </p>
        {item.category_name ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: item.category_color ?? undefined }}
            />
            {item.category_name}
          </p>
        ) : (
          sectionKey !== "income" && (
            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
              카테고리 미연결 — 실제 지출과 비교되지 않아요
            </p>
          )
        )}
        {sectionKey === "income" && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ownerLabel}</p>
        )}
        {sectionKey === "irregular" && installmentProgressLabel(item) && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{installmentProgressLabel(item)}</p>
        )}
        {budgetRow && <CategoryBudgetProgress row={budgetRow} />}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{formatKrw(item.amount)}</span>
        {(sectionKey === "income" || sectionKey === "fixed") &&
          (item.recurring_expense_id !== null ? (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${recurringLinkBadgeStyle(item.recurring_active ?? false)}`}
            >
              {recurringLinkBadgeLabel(item.recurring_active ?? false)}
            </span>
          ) : (
            <button
              onClick={onLinkRecurring}
              className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition-colors"
              aria-label="반복내역으로 등록"
              title="반복내역으로 등록 — 매달 자동으로 가계부에 반영돼요"
            >
              <Repeat size={16} />
            </button>
          ))}
        <button
          onClick={onQuickAdd}
          className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg transition-colors"
          aria-label="가계부에 추가"
          title="가계부에 지금 추가"
        >
          <Send size={16} />
        </button>
        <button
          onClick={onEdit}
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
          aria-label="수정"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
          aria-label="삭제"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
