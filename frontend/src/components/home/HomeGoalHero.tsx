import { Link } from "react-router-dom";
import { ChevronRight, Flame, Heart, Landmark, Target } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import GoalProgressCard, { type GoalProgressCardBadge } from "@/components/financialPlan/GoalProgressCard";
import SavingsTrendSparkline from "@/components/dashboard/SavingsTrendSparkline";
import { ROUTES } from "@/constants/routes";
import { useThemeStore } from "@/stores/themeStore";
import {
  goalDeadlineBadgeStyle,
  progressStatusBadgeClass,
  progressStatusLabel,
  savingsStreakBadgeStyle,
} from "@/utils/colors";
import { computeCardStatus, daysUntil } from "@/utils/goalStatus";
import { formatKrw, formatKrwCompact } from "@/utils/format";
import type { FinancialGoalOut, NotificationReactionOut } from "@/types";

interface Props {
  goal: FinancialGoalOut | null;
  streakMonths: number;
  /** 이번 달 목표 페이스 코칭 문구(goal_pace) — 목표 맥락 안에서 보여주는 게 가장 자연스러워 여기로 모았다. */
  paceMessage: string | null;
  netWorth: number | null;
  couplePhotoUrl: string | null;
  /** 배우자가 최근 목표 마일스톤 알림에 남긴 응원 — "서로 동기부여"를 홈 첫 화면에서 보이게 한다. */
  partnerCheer: NotificationReactionOut | null;
  savingsTrend: { year_month: string; savings: number }[];
}

/** 홈 최상단 "우리 목표는 어디쯤?" 카드. 구 대시보드의 부부 사진 배너 + 목표 카드 + 순자산 카드를 한 장으로
 * 합쳤다: 사진은 작은 아바타로, 순자산은 한 줄 칩(자산 탭 링크)으로 줄이고, 목표 진행·연속 달성·배우자 응원을
 * 가장 크게 보여준다. */
export default function HomeGoalHero({
  goal,
  streakMonths,
  paceMessage,
  netWorth,
  couplePhotoUrl,
  partnerCheer,
  savingsTrend,
}: Props) {
  const isDark = useThemeStore((s) => s.isDark);

  const header = (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        {couplePhotoUrl ? (
          <img src={couplePhotoUrl} alt="부부 사진" className="h-9 w-9 rounded-full object-cover shrink-0" />
        ) : (
          <span className="h-9 w-9 rounded-full bg-primary-50 dark:bg-primary-950 flex items-center justify-center shrink-0">
            <Heart size={16} className="text-primary-500" aria-hidden="true" />
          </span>
        )}
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">우리 부부 목표</span>
      </div>
      {netWorth !== null && (
        <Link
          to={ROUTES.accounts}
          className="flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-3 min-h-[36px] text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          title={`순자산 ${formatKrw(netWorth)}`}
        >
          <Landmark size={12} aria-hidden="true" />
          순자산 {formatKrwCompact(netWorth)}
          <ChevronRight size={12} aria-hidden="true" />
        </Link>
      )}
    </div>
  );

  if (!goal) {
    return (
      <div className="card">
        {header}
        <Link to={ROUTES.goals} className="block">
          <EmptyState
            icon={Target}
            title="아직 목표가 없어요"
            description="부부가 함께 이룰 첫 재무목표를 세워보세요"
            compact
          />
        </Link>
      </div>
    );
  }

  const badges: GoalProgressCardBadge[] = [];
  if (goal.target_date !== null) {
    badges.push({ label: `D-${daysUntil(goal.target_date)}`, toneClassName: goalDeadlineBadgeStyle() });
  }
  const status = computeCardStatus(goal);
  badges.push({ label: progressStatusLabel(status), toneClassName: progressStatusBadgeClass(status) });
  if (streakMonths > 0) {
    badges.push({
      label: `${streakMonths}개월 연속 달성`,
      toneClassName: savingsStreakBadgeStyle(),
      icon: <Flame size={11} aria-hidden="true" />,
    });
  }

  return (
    <div className="card">
      {header}
      <Link to={ROUTES.goals} className="block rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
        <GoalProgressCard
          className="!p-0 !border-0 !shadow-none !bg-transparent"
          title={goal.name}
          badges={badges}
          pct={Number(goal.progress_pct)}
          primaryDetail={
            <>
              {formatKrw(goal.current_amount)} / {formatKrw(goal.required_amount)}
              {goal.eta_year_month && ` · 예상 달성 ${goal.eta_year_month.replace("-", "년 ")}월`}
            </>
          }
          pinnedDetail={
            <>
              {paceMessage && <p>{paceMessage}</p>}
              {partnerCheer && (
                <p className="mt-1 text-primary-600 dark:text-primary-400">
                  {partnerCheer.emoji} {partnerCheer.display_name}님이 응원했어요
                  {partnerCheer.message ? ` — “${partnerCheer.message}”` : ""}
                </p>
              )}
            </>
          }
          footer={
            savingsTrend.some((row) => row.savings !== 0) ? (
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  최근 {savingsTrend.length}개월 저축 추이
                </p>
                <div className="h-12">
                  <SavingsTrendSparkline data={savingsTrend} isDark={isDark} />
                </div>
              </div>
            ) : undefined
          }
        />
      </Link>
    </div>
  );
}
