import { Pencil, Repeat, Send, Trash2 } from "lucide-react";
import AccountActionsMenu, { type AccountActionsMenuItem } from "@/components/common/AccountActionsMenu";
import { formatKrw } from "@/utils/format";
import { installmentProgressLabel } from "@/utils/installment";
import { recurringLinkBadgeLabel, recurringLinkBadgeStyle } from "@/utils/colors";
import type { CashflowPlanItemOut, CashflowSection, UserOut } from "@/types";

interface Props {
  item: CashflowPlanItemOut;
  sectionKey: CashflowSection;
  users: UserOut[] | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onLinkRecurring: () => void;
  onQuickAdd: () => void;
}

export default function CashflowPlanItemRow({
  item,
  sectionKey,
  users,
  onEdit,
  onDelete,
  onLinkRecurring,
  onQuickAdd,
}: Props) {
  const ownerLabel = item.owner_user_id
    ? (users?.find((u) => u.id === item.owner_user_id)?.display_name ?? "공통")
    : "공통";

  const canLinkRecurring =
    (sectionKey === "income" || sectionKey === "fixed") && item.recurring_expense_id === null;

  const menuItems: AccountActionsMenuItem[] = [];
  if (canLinkRecurring) {
    menuItems.push({ icon: <Repeat size={16} />, label: "반복내역으로 등록", onClick: onLinkRecurring });
  }
  menuItems.push({ icon: <Send size={16} />, label: "가계부에 지금 추가", onClick: onQuickAdd });

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
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{formatKrw(item.amount)}</span>
        {(sectionKey === "income" || sectionKey === "fixed") && item.recurring_expense_id !== null && (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${recurringLinkBadgeStyle(item.recurring_active ?? false)}`}
          >
            {recurringLinkBadgeLabel(item.recurring_active ?? false)}
          </span>
        )}
        <AccountActionsMenu items={menuItems} ariaLabel={`${item.name} 작업 더 보기`} />
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
