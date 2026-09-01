import { Fragment, useMemo } from "react";
import type { ReactNode } from "react";
import { currentDateIso } from "@/utils/date";

export interface MonthGridCell {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

interface Props {
  yearMonth: string;
  renderCell: (cell: MonthGridCell) => ReactNode;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function buildGrid(yearMonth: string): Omit<MonthGridCell, "isToday">[] {
  const [y, m] = yearMonth.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const lastDate = new Date(y, m, 0).getDate();
  const leading = firstDay.getDay();
  const cellCount = Math.ceil((leading + lastDate) / 7) * 7;

  const cells: Omit<MonthGridCell, "isToday">[] = [];
  for (let i = 0; i < cellCount; i++) {
    const d = new Date(y, m - 1, i - leading + 1);
    cells.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      day: d.getDate(),
      inCurrentMonth: d.getMonth() === m - 1,
    });
  }
  return cells;
}

export default function MonthCalendarGrid({ yearMonth, renderCell }: Props) {
  const cells = useMemo(() => buildGrid(yearMonth), [yearMonth]);
  const today = currentDateIso();

  return (
    <div className="card-overflow p-1.5 sm:p-3">
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {cells.map((cell) => (
          <Fragment key={cell.date}>{renderCell({ ...cell, isToday: cell.date === today })}</Fragment>
        ))}
      </div>
    </div>
  );
}
