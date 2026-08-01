interface ProgressBarProps {
  pct: number;
  barClassName?: string;
}

export default function ProgressBar({ pct, barClassName = "bg-emerald-500" }: ProgressBarProps) {
  return (
    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full ${barClassName}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
    </div>
  );
}
