import { formatDate } from "@/utils/format";
import RangeStepper from "@/components/common/RangeStepper";

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
    <RangeStepper
      label={formatDate(date)}
      onPrev={() => onChange(shiftDateIso(date, -1))}
      onNext={() => onChange(shiftDateIso(date, 1))}
      prevAriaLabel="전날"
      nextAriaLabel="다음날"
    />
  );
}
