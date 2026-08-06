import ProgressBar from "@/components/common/ProgressBar";
import { formatKrw } from "@/utils/format";
import type { UserTotalsOut } from "@/types";

interface Props {
  title: string;
  byUser: UserTotalsOut[];
  totalUserSavings: number;
}

export default function CoupleContributionCard({ title, byUser, totalUserSavings }: Props) {
  if (byUser.length === 0) return null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">{title}</span>
        <span className="font-bold text-gray-900 dark:text-gray-50">{formatKrw(totalUserSavings)}</span>
      </div>
      <div className="space-y-3">
        {byUser.map((u) => (
          <div key={u.user_id}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-gray-900 dark:text-gray-50">{u.display_name}</span>
              <span className="text-gray-500 dark:text-gray-400">{formatKrw(u.savings)} 보탰어요</span>
            </div>
            <ProgressBar
              pct={totalUserSavings > 0 ? (Math.max(0, Number(u.savings)) / totalUserSavings) * 100 : 0}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
