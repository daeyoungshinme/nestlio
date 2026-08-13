import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { useThemeStore } from "@/stores/themeStore";
import { assetCategoryChartColor } from "@/utils/colors";
import type { AssetCategory } from "@/utils/colors";
import { formatKrwCompact } from "@/utils/format";

interface Props {
  accounts: number;
  savingsInvestment: number;
  realEstate: number;
}

const CATEGORIES: { key: AssetCategory; label: string }[] = [
  { key: "accounts", label: "계좌" },
  { key: "savings_investment", label: "저축·투자" },
  { key: "real_estate", label: "부동산" },
];

// growlio 대시보드 "전체 자산" 도넛(AssetAllocationChart) 컬럼 크기를 기준으로 시작했으나,
// 왼쪽 순자산 금액/산식 영역을 더 넓게 내주기 위해 도넛+범례 컬럼 폭을 추가로 축소했다.
const CHART_COLUMN_CLASS = "shrink-0 self-start w-[156px] sm:w-[180px] lg:w-[198px] xl:w-[210px]";
// 도넛이 박스 안 여백에 파묻히지 않도록, 높이를 링 지름에 맞춰 최소화하고(outerRadius를 90%로
// 올려 지름은 이전과 거의 동일하게 유지) 위쪽에 붙어 보이게 한다.
const CHART_BOX_CLASS = "w-full h-[144px] sm:h-[164px] lg:h-[176px]";

function tooltipStyle(isDark: boolean) {
  const color = isDark ? "#f9fafb" : "#111827";
  return {
    contentStyle: {
      fontSize: 12,
      borderRadius: 8,
      border: `1px solid ${isDark ? "#374151" : "#E5E7EB"}`,
      backgroundColor: isDark ? "#1f2937" : "#ffffff",
      color,
    },
    labelStyle: { color },
    itemStyle: { color },
  };
}

export default function AssetCompositionDonut({ accounts, savingsInvestment, realEstate }: Props) {
  const isDark = useThemeStore((s) => s.isDark);
  const totalsByKey: Record<AssetCategory, number> = {
    accounts,
    savings_investment: savingsInvestment,
    real_estate: realEstate,
  };
  const total = accounts + savingsInvestment + realEstate;

  if (total <= 0) {
    return (
      <div className={`${CHART_COLUMN_CLASS} flex items-center justify-center ${CHART_BOX_CLASS}`}>
        <EmptyState icon={PieChartIcon} title="표시할 자산이 없어요" compact />
      </div>
    );
  }

  const data = CATEGORIES.map(({ key, label }) => ({
    key,
    label,
    value: totalsByKey[key],
    color: assetCategoryChartColor(key, isDark),
  })).filter((d) => d.value > 0);

  return (
    <div className={`${CHART_COLUMN_CLASS} flex flex-col items-center gap-0`}>
      <div className={CHART_BOX_CLASS}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="50%" outerRadius="90%" paddingAngle={3}>
              {data.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle(isDark)} formatter={(v) => formatKrwCompact(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-y-0.5 w-full mt-1">
        {data.map((entry) => (
          <div key={entry.key} className="flex items-center gap-1 min-w-0 w-full">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight truncate min-w-0">
              {entry.label} {Math.round((entry.value / total) * 100)}%
              <span className="text-gray-400 dark:text-gray-500 ml-0.5">· {formatKrwCompact(entry.value)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
