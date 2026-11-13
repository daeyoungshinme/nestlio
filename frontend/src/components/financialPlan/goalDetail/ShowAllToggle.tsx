import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";

/** 목표 상세의 응원·월별 기록 목록을 접었을 때 보이는 수. */
export const DETAIL_LIST_LIMIT = 6;

export default function ShowAllToggle({ expanded, total, onToggle }: { expanded: boolean; total: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`${TOUCH_TARGET_MIN_HEIGHT} w-full text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200`}
    >
      {expanded ? "접기" : `전체 보기 (${total}개)`}
    </button>
  );
}
