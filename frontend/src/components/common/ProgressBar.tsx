interface ProgressBarProps {
  pct: number;
  barClassName?: string;
  /** 실적 막대 위에 목표/가이드라인 지점을 표시하는 세로 마커(0-100, 막대와 같은 스케일). 연간리포트의
   * 가구 평균 대비 지출 비교처럼 "실적 vs 기준선"을 함께 보여줘야 할 때만 지정한다. */
  markerPct?: number;
}

export default function ProgressBar({ pct, barClassName = "bg-emerald-500", markerPct }: ProgressBarProps) {
  return (
    <div className="relative w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full ${barClassName}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
      {markerPct !== undefined && (
        <div
          className="absolute top-0 h-full w-0.5 bg-gray-500 dark:bg-gray-400"
          style={{ left: `${Math.min(Math.max(markerPct, 0), 100)}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
