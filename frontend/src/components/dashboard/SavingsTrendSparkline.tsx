import { savingsTrendChartColor } from "@/utils/colors";
import { formatKrw, formatYearMonth } from "@/utils/format";

type SavingsTrendSparklineProps = {
  data: { year_month: string; savings: number }[];
  isDark: boolean;
};

const VIEW_WIDTH = 300;
const VIEW_HEIGHT = 48;

// 대시보드(로그인 후 기본 랜딩 라우트) footer의 장식용 미니 라인 차트라, recharts(gzip 121KB,
// 앱에서 가장 큰 청크)를 쓰는 대신 손으로 그린 SVG polyline으로 그린다 — 대시보드 첫 로드가
// 더 이상 chart-vendor를 요청하지 않게 하기 위함(모바일 로딩 속도 개선). recharts는 여전히
// /accounts 화면(NetWorthTrendChart/AssetCompositionDonut)에서 지연 로딩으로 쓴다.
export default function SavingsTrendSparkline({ data, isDark }: SavingsTrendSparklineProps) {
  const values = data.map((d) => d.savings);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const stepX = data.length > 1 ? VIEW_WIDTH / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: i * stepX,
    y: VIEW_HEIGHT - ((d.savings - min) / range) * VIEW_HEIGHT,
  }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const first = data[0];
  const last = data[data.length - 1];
  const summary = `저축 추이: ${formatYearMonth(first.year_month)} ${formatKrw(first.savings)}에서 ${formatYearMonth(last.year_month)} ${formatKrw(last.savings)}까지 ${data.length}개월.`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className="w-full h-full"
      role="img"
      aria-label={summary}
    >
      <path
        d={path}
        fill="none"
        stroke={savingsTrendChartColor(isDark)}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
