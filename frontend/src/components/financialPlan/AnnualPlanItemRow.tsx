import { Pencil, Trash2 } from "lucide-react";
import { formatKrw } from "@/utils/format";
import type { AnnualPlanItemOut, UserOut } from "@/types";

interface Props {
  item: AnnualPlanItemOut;
  users: UserOut[] | undefined;
  onEdit: () => void;
  onDelete: () => void;
}

/** CashflowPlanItemRow의 연간 버전 — 할부/반복거래 연동 배지는 연간 항목에 해당 개념이 없어 뺐다. */
export default function AnnualPlanItemRow({ item, users, onEdit, onDelete }: Props) {
  const ownerLabel = item.owner_user_id
    ? (users?.find((u) => u.id === item.owner_user_id)?.display_name ?? "공통")
    : "공통";

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{item.name}</p>
        {item.category_name ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: item.category_color ?? undefined }}
            />
            {item.category_name}
          </p>
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
