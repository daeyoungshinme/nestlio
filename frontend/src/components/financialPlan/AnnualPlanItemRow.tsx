import { Pencil, Trash2 } from "lucide-react";
import AccountActionsMenu, { type AccountActionsMenuItem } from "@/components/common/AccountActionsMenu";
import RowActionButtons from "@/components/common/RowActionButtons";
import { formatKrw } from "@/utils/format";
import type { AnnualPlanItemOut, UserOut } from "@/types";

interface Props {
  item: AnnualPlanItemOut;
  users: UserOut[] | undefined;
  /** 카테고리별로 그룹핑된 목록 안에서 렌더링될 때는 그룹 헤더에 이미 카테고리가 표시되므로
   * 항목 행의 카테고리 dot+이름을 생략한다 (기본값 true, "카테고리 미연결" 경고는 그룹 여부와
   * 무관하게 항상 표시). */
  showCategory?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/** CashflowPlanItemRow의 연간 버전 — 할부/반복거래 연동 배지는 연간 항목에 해당 개념이 없어 뺐다. */
export default function AnnualPlanItemRow({ item, users, showCategory = true, onEdit, onDelete }: Props) {
  const ownerLabel = item.owner_user_id
    ? (users?.find((u) => u.id === item.owner_user_id)?.display_name ?? "공통")
    : "공통";

  const mobileMenuItems: AccountActionsMenuItem[] = [
    { icon: <Pencil size={16} />, label: "수정", onClick: onEdit },
    { icon: <Trash2 size={16} />, label: "삭제", onClick: onDelete, variant: "danger" },
  ];

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{item.name}</p>
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
          item.section !== "income" && (
            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
              카테고리 미연결 — 카테고리별 연간 실적과 비교되지 않아요
            </p>
          )
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ownerLabel}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{formatKrw(item.annual_target)}</span>
        <div className="hidden sm:flex items-center gap-1">
          <RowActionButtons onEdit={onEdit} onDelete={onDelete} />
        </div>
        <div className="sm:hidden">
          <AccountActionsMenu items={mobileMenuItems} ariaLabel={`${item.name} 작업 더 보기`} />
        </div>
      </div>
    </div>
  );
}
