import { ChevronLeft, ChevronRight } from "lucide-react";
import { currentDateIso, shiftDateIso } from "@/components/common/DayPicker";
import { formatWeekRange } from "@/utils/format";

function mondayIso(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return shiftDateIso(dateIso, -daysSinceMonday);
}

export function currentWeekAnchor(): string {
  return currentDateIso();
}

export function shiftWeekAnchor(dateIso: string, deltaWeeks: number): string {
  return shiftDateIso(dateIso, deltaWeeks * 7);
}

interface Props {
  date: string;
  onChange: (date: string) => void;
}

export default function WeekPicker({ date, onChange }: Props) {
  const monday = mondayIso(date);
  const sunday = shiftDateIso(monday, 6);
  const isCurrentWeek = monday === mondayIso(currentDateIso());

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => onChange(shiftWeekAnchor(date, -1))}
        className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="지난주"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 w-28 text-center">
        {formatWeekRange(monday, sunday)}
      </span>
      <button
        onClick={() => onChange(shiftWeekAnchor(date, 1))}
        className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="다음주"
      >
        <ChevronRight size={18} />
      </button>
      {!isCurrentWeek && (
        <button
          onClick={() => onChange(currentWeekAnchor())}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          이번주
        </button>
      )}
    </div>
  );
}
