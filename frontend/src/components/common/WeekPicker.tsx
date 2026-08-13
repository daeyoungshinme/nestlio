import { currentDateIso, shiftDateIso } from "@/components/common/DayPicker";
import { formatWeekRange } from "@/utils/format";
import RangeStepper from "@/components/common/RangeStepper";

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

  return (
    <RangeStepper
      label={formatWeekRange(monday, sunday)}
      onPrev={() => onChange(shiftWeekAnchor(date, -1))}
      onNext={() => onChange(shiftWeekAnchor(date, 1))}
      prevAriaLabel="지난주"
      nextAriaLabel="다음주"
    />
  );
}
