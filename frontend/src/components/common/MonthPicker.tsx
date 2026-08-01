import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatYearMonth } from "@/utils/format";

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface Props {
  yearMonth: string;
  onChange: (yearMonth: string) => void;
}

export default function MonthPicker({ yearMonth, onChange }: Props) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => onChange(shiftYearMonth(yearMonth, -1))}
        className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="이전 달"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 w-28 text-center">
        {formatYearMonth(yearMonth)}
      </span>
      <button
        onClick={() => onChange(shiftYearMonth(yearMonth, 1))}
        className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="다음 달"
      >
        <ChevronRight size={18} />
      </button>
      {yearMonth !== currentYearMonth() && (
        <button
          onClick={() => onChange(currentYearMonth())}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          오늘
        </button>
      )}
    </div>
  );
}
