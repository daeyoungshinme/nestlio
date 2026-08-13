import { formatYearMonth } from "@/utils/format";
import RangeStepper from "@/components/common/RangeStepper";

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
    <RangeStepper
      label={formatYearMonth(yearMonth)}
      onPrev={() => onChange(shiftYearMonth(yearMonth, -1))}
      onNext={() => onChange(shiftYearMonth(yearMonth, 1))}
      prevAriaLabel="이전 달"
      nextAriaLabel="다음 달"
    />
  );
}
