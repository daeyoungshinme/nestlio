import { memo } from "react";
import { LEDGER_DAY_CELL_MIN_HEIGHT } from "@/constants/uiSizes";
import type { EventOut } from "@/types";

interface Props {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  events: EventOut[];
  onSelect: (date: string) => void;
}

const CHIP_LIMIT = 3;

function ScheduleDayCell({ date, day, inCurrentMonth, isToday, events, onSelect }: Props) {
  const overflow = events.length - CHIP_LIMIT;

  return (
    <button
      type="button"
      disabled={!inCurrentMonth}
      onClick={() => onSelect(date)}
      className={`flex flex-col items-start gap-0.5 ${LEDGER_DAY_CELL_MIN_HEIGHT} p-1 sm:p-1.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 text-left transition-colors ${
        inCurrentMonth ? "hover:bg-gray-50 dark:hover:bg-gray-800" : "opacity-40 cursor-default"
      }`}
    >
      <span
        className={`text-xs sm:text-sm font-medium ${
          isToday
            ? "bg-blue-600 text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center"
            : "text-gray-700 dark:text-gray-300"
        }`}
      >
        {day}
      </span>
      <div className="flex flex-col items-start gap-0.5 w-full">
        {events.slice(0, CHIP_LIMIT).map((event) => (
          <span
            key={event.id}
            title={event.title}
            className={`w-full truncate text-[9px] sm:text-[10px] font-medium px-1 rounded ${
              event.completed_at != null
                ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 line-through"
                : "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {event.title}
          </span>
        ))}
        {overflow > 0 && (
          <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500">+{overflow}개 더보기</span>
        )}
      </div>
    </button>
  );
}

export default memo(ScheduleDayCell);
