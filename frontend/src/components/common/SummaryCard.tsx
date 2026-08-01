interface Props {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
  sub?: string;
}

const TONE_CLASS: Record<NonNullable<Props["tone"]>, string> = {
  default: "text-gray-900 dark:text-gray-50",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-red-600 dark:text-red-400",
};

export default function SummaryCard({ label, value, tone = "default", sub }: Props) {
  return (
    <div className="card">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-lg sm:text-xl font-bold ${TONE_CLASS[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}
