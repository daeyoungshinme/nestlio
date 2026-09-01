import { formatDate } from "@/utils/format";
import { shiftDateIso } from "@/utils/date";
import RangeStepper from "@/components/common/RangeStepper";

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
