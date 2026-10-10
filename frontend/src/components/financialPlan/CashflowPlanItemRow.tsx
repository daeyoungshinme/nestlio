import { Repeat, Send, Trash2 } from "lucide-react";
import AccountActionsMenu, { type AccountActionsMenuItem } from "@/components/common/AccountActionsMenu";
import RowActionButtons from "@/components/common/RowActionButtons";
import { formatKrw, resolveOwnerLabel } from "@/utils/format";
import { installmentProgressLabel } from "@/utils/installment";
import { cautionTextClass, recurringLinkBadgeLabel, recurringLinkBadgeStyle } from "@/utils/colors";
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

  const canLinkRecurring = (sectionKey === "income" || sectionKey === "fixed") && item.recurring_expense_id === null;

  const menuItems: AccountActionsMenuItem[] = [];
  if (canLinkRecurring) {
    menuItems.push({ icon: <Repeat size={16} />, label: "반복내역으로 등록", onClick: onLinkRecurring });
  }
  menuItems.push({ icon: <Send size={16} />, label: "가계부에 지금 추가", onClick: onQuickAdd });

  // 모바일은 행(이름 영역)을 누르면 바로 수정 — 가장 흔한 동작을 "⋯" 뒤에 숨기지 않는다. 나머지는 메뉴로.
  const mobileMenuItems: AccountActionsMenuItem[] = [
    ...menuItems,
    { icon: <Trash2 size={16} />, label: "이번 달에서 삭제", onClick: onDelete, variant: "danger" as const },
  ];

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${item.name} 수정`}
        className="min-w-0 flex-1 text-left min-h-[44px] rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 -mx-1 px-1"
      >
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
          {item.name}
          {item.installment_total !== null && (
            <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
              ({item.installment_no}/{item.installment_total})
            </span>
          )}
        </span>
        {item.category_name ? (
          showCategory && (
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: item.category_color ?? undefined }}
              />
              {item.category_name}
            </span>
          )
        ) : (
          sectionKey !== "income" && (
            <span className={`block mt-0.5 text-xs ${cautionTextClass()}`}>
              카테고리 미연결 — 실제 지출과 비교되지 않아요
            </span>
          )
        )}
        <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ownerLabel}</span>
        {sectionKey === "irregular" && installmentProgressLabel(item) && (
          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{installmentProgressLabel(item)}</span>
        )}
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{formatKrw(item.amount)}</span>
        {item.spans_multiple_months && (
          <span
            title="연간계획의 이번 달 금액이에요. 여기서 바꾸면 이번 달에만 적용돼요."
            className="px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
            연간계획
          </span>
        )}
        {(sectionKey === "income" || sectionKey === "fixed") && item.recurring_expense_id !== null && (
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${recurringLinkBadgeStyle(item.recurring_active ?? false)}`}
          >
            {recurringLinkBadgeLabel(item.recurring_active ?? false)}
          </span>
        )}
        <div className="hidden sm:flex items-center gap-1">
          <AccountActionsMenu items={menuItems} ariaLabel={`${item.name} 작업 더 보기`} />
          <RowActionButtons onEdit={onEdit} onDelete={onDelete} />
        </div>
        <div className="sm:hidden">
          <AccountActionsMenu items={mobileMenuItems} ariaLabel={`${item.name} 작업 더 보기`} />
        </div>
      </div>
    </div>
  );
}
