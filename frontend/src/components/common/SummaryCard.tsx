interface Props {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
  sub?: string;
  className?: string;
  /** value의 툴팁 텍스트. 미지정 시 value로 폴백 — value가 축약 표기일 때 전체 금액을 보여주기 위함. */
  title?: string;
  /** sub 아래에 한 줄 더 보여주는 작은 배지 텍스트(계획 대비 % 등). 색상은 호출부가 결정한다. */
  badge?: { label: string; toneClassName: string };
}

const TONE_CLASS: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-gray-900 dark:text-gray-50",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
};

export default function SummaryCard({ label, value, tone = "default", sub, className, title, badge }: Props) {
  return (
    <div className={`card min-w-0 ${className ?? ""}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
      <p className={`mt-1 text-lg sm:text-xl font-bold truncate ${TONE_CLASS[tone]}`} title={title ?? value}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 truncate">{sub}</p>}
      {badge && <p className={`mt-0.5 text-xs font-medium truncate ${badge.toneClassName}`}>{badge.label}</p>}
    </div>
  );
}
