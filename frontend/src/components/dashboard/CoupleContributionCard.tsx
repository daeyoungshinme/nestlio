import { Crown } from "lucide-react";
import ProgressBar from "@/components/common/ProgressBar";
import StatusBadge from "@/components/common/StatusBadge";
import { contributionLeaderBadgeStyle } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import type { OwnerTotalsOut } from "@/types";

interface Props {
  title: string;
  ownerTotals: OwnerTotalsOut[];
  totalOwnerSavings: number;
}

function ownerKey(ownerUserId: string | null): string {
  return ownerUserId ?? "shared";
}

export default function CoupleContributionCard({ title, ownerTotals, totalOwnerSavings }: Props) {
  if (ownerTotals.length === 0) return null;

  // 저축 기여도 기준 랭킹 — 각자 저축액이 부부 합산 저축액에서 차지하는 비중을 진행바로,
  // 가장 많이 모은 사람에게 리더 배지를 붙인다(2명 모두 저축액이 같으면 굳이 표시하지 않는다).
  const rankedOwners = ownerTotals.slice().sort((a, b) => Number(b.savings) - Number(a.savings));
  const totalSavingsForShare = rankedOwners.reduce((sum, o) => sum + Math.max(0, Number(o.savings)), 0);
  const maxSavings = rankedOwners.length > 0 ? Number(rankedOwners[0].savings) : 0;
  const showLeaderBadge = rankedOwners.length > 1 && maxSavings > 0 && Number(rankedOwners[1].savings) < maxSavings;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">{title}</span>
        <span className="font-bold text-gray-900 dark:text-gray-50">{formatKrw(totalOwnerSavings)}</span>
      </div>
      <div className="space-y-3">
        {rankedOwners.map((o, i) => {
          const isLeader = showLeaderBadge && i === 0;
          return (
            <div key={ownerKey(o.owner_user_id)}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="flex items-center gap-1 font-medium text-gray-900 dark:text-gray-50">
                  {o.display_name}
                  {isLeader && (
                    <StatusBadge
                      label="이번 저축 리더"
                      toneClassName={contributionLeaderBadgeStyle()}
                      icon={<Crown size={11} aria-hidden="true" />}
                    />
                  )}
                </span>
                <span className="text-gray-500 dark:text-gray-400">저축 {formatKrw(o.savings)}</span>
              </div>
              <ProgressBar
                pct={totalSavingsForShare > 0 ? (Math.max(0, Number(o.savings)) / totalSavingsForShare) * 100 : 0}
              />
              {Number(o.savings_investment) > 0 && (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  저축·투자 {formatKrw(o.savings_investment)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
