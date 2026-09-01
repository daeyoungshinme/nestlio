import { formatYearMonth } from "@/utils/format";
import { shiftYearMonth } from "@/utils/date";
import RangeStepper from "@/components/common/RangeStepper";

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
