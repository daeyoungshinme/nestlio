import { RefreshCw } from "lucide-react";
import Button from "@/components/common/Button";
import ProgressBar from "@/components/common/ProgressBar";
import { cautionTextClass } from "@/utils/colors";
import { formatKrwCompact, formatSyncedAt } from "@/utils/format";
import type { CombinedMemberOut, GrowlioGoalSnapshotOut } from "@/types";

/** 배우자 값이 이보다 오래되면 주의 표시 — 배우자가 nestlio를 열어야 갱신된다. */
const STALE_DAYS = 3;

function isStale(syncedAt: string, now: Date): boolean {
  return now.getTime() - new Date(syncedAt).getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;
}

function growlioChips(snap: GrowlioGoalSnapshotOut): string[] {
  const chips: string[] = [];
  if (snap.annual_deposit_goal !== null) {
    chips.push(
      `올해 입금 ${formatKrwCompact(Number(snap.annual_deposit_current ?? 0))} / ${formatKrwCompact(Number(snap.annual_deposit_goal))}`,
    );
  }
  if (snap.annual_dividend_goal !== null) {
    chips.push(
      `배당 ${formatKrwCompact(Number(snap.estimated_annual_dividend ?? 0))} / ${formatKrwCompact(Number(snap.annual_dividend_goal))}`,
    );
  }
  if (snap.goal_annual_return_pct !== null) {
    const actual = snap.actual_return_pct !== null ? `${Number(snap.actual_return_pct).toFixed(1)}%` : "-";
    chips.push(`수익률 ${actual} / 목표 ${Number(snap.goal_annual_return_pct).toFixed(1)}%`);
  }
  if (snap.retirement_target_year !== null) chips.push(`${snap.retirement_target_year}년 은퇴`);
  return chips;
}

function memberStatus(member: CombinedMemberOut, isMine: boolean): string | null {
  if (member.type !== "growlio") return null;
  if (member.synced_at === null) {
    return isMine ? "아직 불러오지 않았어요" : "배우자가 nestlio를 열면 채워져요";
  }
  if (member.growlio === null || !member.growlio.is_configured) return "growlio에 투자목표가 없어요";
  if (member.current_amount === null) return "growlio 업데이트 후 현재 금액이 보여요";
  return null;
}

/** 부부 통합 목표의 구성 목록 — 목표 카드(compact)와 상세 화면이 함께 쓴다. growlio 구성은 마지막 동기화 시각을 늘
 * 보여준다(배우자 값은 배우자가 nestlio를 열 때만 갱신된다). */
export default function CombinedMembersList({
  members,
  meId,
  compact = false,
  now,
  onRefreshMine,
  refreshing = false,
}: {
  members: CombinedMemberOut[];
  meId: string | null;
  compact?: boolean;
  /** 렌더 중 new Date()는 비순수 호출이라 호출부가 한 번 잡아 넘긴다. */
  now: Date;
  onRefreshMine?: () => void;
  refreshing?: boolean;
}) {
  return (
    <ul className={compact ? "space-y-1.5" : "space-y-3"}>
      {members.map((member) => {
        const isMine = member.type === "growlio" && member.user_id === meId;
        const status = memberStatus(member, isMine);
        const stale = member.synced_at !== null && isStale(member.synced_at, now);
        const key = member.type === "goal" ? `goal-${member.goal_id}` : `growlio-${member.user_id}`;
        return (
          <li key={key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-gray-700 dark:text-gray-200">{member.name}</span>
              <span className="shrink-0 text-gray-500 dark:text-gray-400">
                {member.current_amount !== null && member.required_amount !== null
                  ? `${formatKrwCompact(Number(member.current_amount))} / ${formatKrwCompact(Number(member.required_amount))}`
                  : member.required_amount !== null
                    ? `목표 ${formatKrwCompact(Number(member.required_amount))}`
                    : "-"}
              </span>
            </div>
            {member.progress_pct !== null && <ProgressBar pct={Number(member.progress_pct)} />}
            {status !== null && <p className="text-[11px] text-gray-500 dark:text-gray-400">{status}</p>}
            {member.synced_at !== null && (!compact || stale) && (
              <p className={`text-[11px] ${stale ? cautionTextClass() : "text-gray-500 dark:text-gray-400"}`}>
                {formatSyncedAt(member.synced_at)} 동기화{stale && !isMine ? " · 배우자가 앱을 열면 갱신돼요" : ""}
              </p>
            )}
            {!compact && member.growlio !== null && member.growlio.is_configured && (
              <div className="flex flex-wrap gap-1">
                {growlioChips(member.growlio).map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-300"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
            {!compact && isMine && onRefreshMine && (
              <Button
                size="sm"
                variant="secondary"
                icon={<RefreshCw size={14} />}
                loading={refreshing}
                onClick={onRefreshMine}
              >
                내 growlio 목표 지금 동기화
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
