import { Pencil, Repeat, Send, Trash2 } from "lucide-react";
import AccountActionsMenu, { type AccountActionsMenuItem } from "@/components/common/AccountActionsMenu";
import RowActionButtons from "@/components/common/RowActionButtons";
import { formatKrw, resolveOwnerLabel } from "@/utils/format";
import { installmentProgressLabel } from "@/utils/installment";
import { recurringLinkBadgeLabel, recurringLinkBadgeStyle } from "@/utils/colors";
import type { CashflowPlanItemOut, CashflowSection, UserOut } from "@/types";

interface Props {
  item: CashflowPlanItemOut;
  sectionKey: CashflowSection;
  users: UserOut[] | undefined;
  /** 카테고리별로 그룹핑된 목록 안에서 렌더링될 때는 그룹 헤더에 이미 카테고리가 표시되므로
   * 항목 행의 카테고리 dot+이름을 생략한다 (기본값 true, "카테고리 미연결" 경고는 그룹 여부와
   * 무관하게 항상 표시). */
  showCategory?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onLinkRecurring: () => void;
  onQuickAdd: () => void;
}

export default function CashflowPlanItemRow({
  item,
  sectionKey,
  users,
  showCategory = true,
  onEdit,
  onDelete,
  onLinkRecurring,
  onQuickAdd,
}: Props) {
  const ownerLabel = resolveOwnerLabel(item.owner_user_id, users);

  const canLinkRecurring =
    item.id !== null && (sectionKey === "income" || sectionKey === "fixed") && item.recurring_expense_id === null;

  const menuItems: AccountActionsMenuItem[] = [];
  if (canLinkRecurring) {
    menuItems.push({ icon: <Repeat size={16} />, label: "반복내역으로 등록", onClick: onLinkRecurring });
  }
  menuItems.push({ icon: <Send size={16} />, label: "가계부에 지금 추가", onClick: onQuickAdd });

  const mobileMenuItems: AccountActionsMenuItem[] = [
    ...menuItems,
    { icon: <Pencil size={16} />, label: "수정", onClick: onEdit },
    ...(item.id !== null
      ? [{ icon: <Trash2 size={16} />, label: "삭제", onClick: onDelete, variant: "danger" as const }]
      : []),
  ];

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
          showCategory && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: item.category_color ?? undefined }}
              />
              {item.category_name}
            </p>
          )
        ) : (
          sectionKey !== "income" && (
            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
              카테고리 미연결 — 실제 지출과 비교되지 않아요
            </p>
          )
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ownerLabel}</p>
        {sectionKey === "irregular" && installmentProgressLabel(item) && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{installmentProgressLabel(item)}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{formatKrw(item.amount)}</span>
        {item.from_annual_plan && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
            연간계획
          </span>
        )}
        {(sectionKey === "income" || sectionKey === "fixed") && item.recurring_expense_id !== null && (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${recurringLinkBadgeStyle(item.recurring_active ?? false)}`}
          >
            {recurringLinkBadgeLabel(item.recurring_active ?? false)}
          </span>
        )}
        <div className="hidden sm:flex items-center gap-1">
          <AccountActionsMenu items={menuItems} ariaLabel={`${item.name} 작업 더 보기`} />
          <RowActionButtons onEdit={onEdit} onDelete={item.id !== null ? onDelete : undefined} />
        </div>
        <div className="sm:hidden">
          <AccountActionsMenu items={mobileMenuItems} ariaLabel={`${item.name} 작업 더 보기`} />
        </div>
      </div>
    </div>
  );
}
