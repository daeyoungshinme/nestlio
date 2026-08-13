interface StatItem {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
}

interface Props {
  items: StatItem[];
  className?: string;
}

const TONE_CLASS: Record<NonNullable<StatItem["tone"]>, string> = {
  default: "text-gray-900 dark:text-gray-50",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
};

/** 카드 그리드(`SummaryCard`) 대신 라벨:값을 한 줄로 나열하는 경량 요약 — 항목이 적거나
 * 그룹 헤더 등 다른 곳에 이미 총액이 보여서 큰 카드가 필요 없는 곳에 쓴다. */
export default function InlineStatsBar({ items, className }: Props) {
  return (
    <div className={`grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2 ${className ?? ""}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className="card flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-1.5"
        >
          <span className="text-xs text-gray-500 dark:text-gray-400">{item.label}</span>
          <span className={`text-sm font-semibold ${TONE_CLASS[item.tone ?? "default"]}`}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
