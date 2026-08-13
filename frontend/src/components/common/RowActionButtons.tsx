import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";

interface Props {
  onEdit?: () => void;
  onDelete: () => void;
  editLabel?: string;
  deleteLabel?: string;
  deleteIcon?: ReactNode;
  deleteDisabled?: boolean;
}

/** CRUD 리소스 섹션이 반복하던 행별 수정/삭제 아이콘 버튼 마크업 공통화.
 * onEdit을 생략하면 삭제(비활성화) 버튼만 렌더링한다. */
export default function RowActionButtons({
  onEdit,
  onDelete,
  editLabel = "수정",
  deleteLabel = "삭제",
  deleteIcon = <Trash2 size={16} />,
  deleteDisabled = false,
}: Props) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      {onEdit && (
        <button
          onClick={onEdit}
          aria-label={editLabel}
          className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors`}
        >
          <Pencil size={16} />
        </button>
      )}
      <button
        onClick={onDelete}
        aria-label={deleteLabel}
        disabled={deleteDisabled}
        className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors disabled:opacity-50`}
      >
        {deleteIcon}
      </button>
    </div>
  );
}
