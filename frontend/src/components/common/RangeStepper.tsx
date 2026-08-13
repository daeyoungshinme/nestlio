import { ChevronLeft, ChevronRight } from "lucide-react";
import { TOUCH_TARGET_COMPACT_MOBILE_ONLY } from "@/constants/uiSizes";

interface Props {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  prevAriaLabel: string;
  nextAriaLabel: string;
}

/** DayPicker/WeekPicker/MonthPicker가 공유하는 좌우 화살표 + 중앙 라벨 셸.
 * 각 날짜 단위의 이동/포맷 로직은 호출부가 맡고, 여기서는 마크업만 공통화한다. */
export default function RangeStepper({ label, onPrev, onNext, prevAriaLabel, nextAriaLabel }: Props) {
  return (
    <div className="flex items-center gap-1 sm:gap-4">
      <button
        onClick={onPrev}
        className={`${TOUCH_TARGET_COMPACT_MOBILE_ONLY} p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800`}
        aria-label={prevAriaLabel}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 w-24 sm:w-28 text-center whitespace-nowrap">
        {label}
      </span>
      <button
        onClick={onNext}
        className={`${TOUCH_TARGET_COMPACT_MOBILE_ONLY} p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800`}
        aria-label={nextAriaLabel}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
