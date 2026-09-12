import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { savingsTrendChartColor } from "@/utils/colors";
import { formatKrw } from "@/utils/format";

type SavingsTrendSparklineProps = {
  data: { year_month: string; savings: number }[];
  isDark: boolean;
};

export default function SavingsTrendSparkline({ data, isDark }: SavingsTrendSparklineProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Tooltip
          formatter={(value) => [formatKrw(Number(value)), "저축"]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Line
          type="monotone"
          dataKey="savings"
          stroke={savingsTrendChartColor(isDark)}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
