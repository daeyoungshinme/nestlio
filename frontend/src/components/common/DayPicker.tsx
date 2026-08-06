import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate } from "@/utils/format";

export function currentDateIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftDateIso(dateIso: string, deltaDays: number): string {
  const [y, m, day] = dateIso.split("-").map(Number);
  const d = new Date(y, m - 1, day + deltaDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  date: string;
  onChange: (date: string) => void;
}

export default function DayPicker({ date, onChange }: Props) {
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => onChange(shiftDateIso(date, -1))}
        className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="전날"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 w-28 text-center">
        {formatDate(date)}
      </span>
      <button
        onClick={() => onChange(shiftDateIso(date, 1))}
        className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="다음날"
      >
        <ChevronRight size={18} />
      </button>
      {date !== currentDateIso() && (
        <button
          onClick={() => onChange(currentDateIso())}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          오늘
        </button>
      )}
    </div>
  );
}
