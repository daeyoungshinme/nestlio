import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Target } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import ProgressBar from "@/components/common/ProgressBar";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import { cheerGoal, fetchGoalGrowlioInsight } from "@/api/goals";
import { fetchNotifications } from "@/api/notifications";
import { GROWLIO_APP_URL, findGrowlioInvestmentLink, growlioPortfolioUrl } from "@/constants/growlio";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { NOTIFICATIONS_REFETCH_INTERVAL, STALE_TIME } from "@/constants/queryConfig";
import { ROUTES } from "@/constants/routes";
import { INPUT_SM } from "@/constants/inputStyles";
import { useGoals, useSavingsProducts } from "@/hooks/useReferenceData";
import { monthsToGoalWithExtra } from "@/utils/goalAcceleration";
import { computeCardStatus, daysUntil } from "@/utils/goalStatus";
import { progressStatusBadgeClass, progressStatusLabel } from "@/utils/colors";
import { formatDate, formatKrw, formatKrwCompact, formatPercent, formatYearMonth } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { FinancialGoalOut, NotificationOut } from "@/types";

const CHEER_EMOJIS = ["🎉", "👏", "❤️", "💪", "🥳"];
const GOAL_NOTIF_TYPES = new Set(["goal_milestone", "challenge_success", "goal_cheer"]);
const SCENARIO_STEP = 50_000;
const SCENARIO_MAX = 1_000_000;

/** 목표 하나의 상세 — 목표 카드에 다 담기 어려웠던 "어떻게 하면 더 빨리?"와 "서로 응원"을 모았다:
 * 진행 요약, 월 추가 저축 시나리오, 월별 달성 기록, 연동 자금원, 응원 보내기와 이 목표의 축하·응원 기록. */
export default function GoalDetailPage() {
  const { id } = useParams();
  const goalId = Number(id);
  const goalsQuery = useGoals();

  return (
    <QueryBoundary query={goalsQuery} loadingFallback={<SkeletonCard rows={6} />} errorMessage="목표를 불러오지 못했습니다.">
      {(goals) => {
        const goal = goals.find((g) => g.id === goalId);
        if (!goal) {
          return (
            <div className="card">
              <EmptyState icon={Target} title="목표를 찾을 수 없어요" description="삭제됐거나 잘못된 주소예요." compact />
              <div className="flex justify-center">
                <Link to={ROUTES.goals} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                  목표 목록으로
                </Link>
              </div>
            </div>
          );
        }
        return <GoalDetail goal={goal} />;
      }}
    </QueryBoundary>
  );
}

function GoalDetail({ goal }: { goal: FinancialGoalOut }) {
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [cheerMessage, setCheerMessage] = useState("");
  const queryClient = useQueryClient();
  const { data: savingsProducts } = useSavingsProducts();
  const { data: notifications } = useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: fetchNotifications,
    refetchInterval: NOTIFICATIONS_REFETCH_INTERVAL,
  });

  const cheerMutation = useMutation({
    mutationFn: (emoji: string) => cheerGoal(goal.id, { emoji, message: cheerMessage.trim() || null }),
    onSuccess: () => {
      setCheerMessage("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
      toast("응원을 보냈어요! 배우자의 알림함에 전해져요.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const isChallenge = goal.kind === "challenge";
  const status = computeCardStatus(goal);
  const scenario = monthsToGoalWithExtra(goal.required_amount, goal.current_amount, goal.planned_monthly_amount, extraMonthly);
  const growlioAccountId = findGrowlioInvestmentLink(goal, savingsProducts ?? []);
  const goalNotifications: NotificationOut[] = (notifications?.items ?? []).filter(
    (n) => GOAL_NOTIF_TYPES.has(n.notif_type) && n.related_id === goal.id,
  );

  return (
    <div className="space-y-4">
      <Link
        to={ROUTES.goals}
        className="inline-flex items-center gap-1 min-h-[44px] text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        목표 목록
      </Link>

      <div className="card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isChallenge ? "챌린지" : `${goal.priority}순위 목표`}
              {goal.target_date && ` · D-${daysUntil(goal.target_date)}`}
            </p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 truncate">{goal.name}</h2>
          </div>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${progressStatusBadgeClass(status)}`}>
            {progressStatusLabel(status)}
          </span>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-50">{formatPercent(Number(goal.progress_pct))}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {formatKrwCompact(Number(goal.current_amount))} / {formatKrwCompact(Number(goal.required_amount))}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar pct={Number(goal.progress_pct)} />
          </div>
        </div>
        {!isChallenge && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">월 저축 계획</dt>
              <dd className="font-semibold text-gray-900 dark:text-gray-50">{formatKrw(goal.planned_monthly_amount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">예상 달성</dt>
              <dd className="font-semibold text-gray-900 dark:text-gray-50">
                {goal.eta_year_month ? formatYearMonth(goal.eta_year_month) : "계획 필요"}
                {goal.ahead_behind_months !== null && (
                  <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                    (목표일보다 {Math.abs(goal.ahead_behind_months)}개월 {goal.ahead_behind_months >= 0 ? "빠름" : "늦음"})
                  </span>
                )}
              </dd>
            </div>
            {goal.eta_with_return_year_month && goal.expected_annual_return_pct !== null && (
              <div className="col-span-2">
                <dt className="text-xs text-gray-500 dark:text-gray-400">
                  연 {Number(goal.expected_annual_return_pct)}% 수익을 반영하면
                </dt>
                <dd className="font-semibold text-primary-600 dark:text-primary-400">
                  {formatYearMonth(goal.eta_with_return_year_month)} 달성 예상
                </dd>
              </div>
            )}
            {goal.suggested_monthly_amount !== null && (
              <div className="col-span-2">
                <dt className="text-xs text-gray-500 dark:text-gray-400">목표일에 맞추려면 매달</dt>
                <dd className="font-semibold text-gray-900 dark:text-gray-50">{formatKrw(goal.suggested_monthly_amount)}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {!isChallenge && scenario.baseMonths !== 0 && (
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">매달 조금 더 모으면?</h2>
          <input
            type="range"
            min={0}
            max={SCENARIO_MAX}
            step={SCENARIO_STEP}
            value={extraMonthly}
            onChange={(e) => setExtraMonthly(Number(e.target.value))}
            className="w-full accent-primary-600"
            aria-label="매달 추가로 모을 금액"
          />
          <p className="text-sm text-gray-700 dark:text-gray-300">
            매달 <strong>{formatKrw(extraMonthly)}</strong> 더 모으면{" "}
            {scenario.newMonths === null ? (
              "월 저축 계획을 먼저 세워주세요."
            ) : scenario.monthsSaved > 0 ? (
              <>
                <strong>{scenario.newMonths}개월</strong> 뒤 달성 — 지금보다 <strong>{scenario.monthsSaved}개월</strong> 빨라져요.
              </>
            ) : (
              <>
                지금 계획으로 <strong>{scenario.newMonths}개월</strong> 뒤 달성해요.
              </>
            )}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            투자 수익을 빼고 계산한 값이에요. 지출을 줄여 만든 돈을 계획 탭의 저축·투자 계획에 더해보세요.
          </p>
        </div>
      )}

      {!isChallenge && GROWLIO_APP_URL && <GrowlioInsightCard goalId={goal.id} />}

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">서로 응원하기</h2>
        <input
          type="text"
          value={cheerMessage}
          onChange={(e) => setCheerMessage(e.target.value)}
          maxLength={200}
          placeholder="한마디 남기기 (선택)"
          className={`${INPUT_SM} w-full`}
          aria-label="응원 메시지"
        />
        <div className="flex flex-wrap gap-2">
          {CHEER_EMOJIS.map((emoji) => (
            <Button
              key={emoji}
              variant="secondary"
              size="sm"
              disabled={cheerMutation.isPending}
              onClick={() => cheerMutation.mutate(emoji)}
              aria-label={`${emoji}로 응원 보내기`}
            >
              {emoji}
            </Button>
          ))}
        </div>
        {goalNotifications.length > 0 && (
          <ul className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            {goalNotifications.map((n) => (
              <li key={n.id} className="text-sm text-gray-700 dark:text-gray-300">
                <span className="text-xs text-gray-400 dark:text-gray-500 mr-1.5">{formatDate(n.sent_at.slice(0, 10))}</span>
                {n.detail?.split("\n")[0]}
                {n.notif_type !== "goal_cheer" && n.reactions.length > 0 && (
                  <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {n.reactions.map((r) => `${r.emoji} ${r.display_name}`).join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {goal.monthly_targets.length > 0 && (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">월별 달성 기록</h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {goal.monthly_targets.map((mt) => (
              <div key={mt.year_month} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-gray-700 dark:text-gray-300">
                  {mt.is_achieved ? "✅ " : ""}
                  {formatYearMonth(mt.year_month)}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {formatKrw(mt.achieved_amount)} / {formatKrw(mt.target_amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {goal.funding_sources.length > 0 && (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">연동된 자금원</h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {goal.funding_sources.map((fs) => (
              <div key={`${fs.type}-${fs.id}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate text-gray-700 dark:text-gray-300">{fs.name}</span>
                <span className="shrink-0 text-gray-900 dark:text-gray-50">{formatKrw(fs.amount)}</span>
              </div>
            ))}
          </div>
          {growlioAccountId && GROWLIO_APP_URL && (
            <a
              href={growlioPortfolioUrl(growlioAccountId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 min-h-[44px] text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              <ExternalLink size={14} aria-hidden="true" />
              growlio에서 이 목표의 포트폴리오 보기
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** "투자 수익을 반영하면?" — growlio가 계산한 이 목표의 필요 연수익률과 실제 투자 수익률(XIRR)을 나란히 보여주고,
 * 가정 수익률별로 매달 얼마를 모아야 하는지 안내한다. growlio 미설정·접속 실패·목표일 없음이면 숨긴다. */
function GrowlioInsightCard({ goalId }: { goalId: number }) {
  const { data, isError } = useQuery({
    queryKey: QUERY_KEYS.financialGoalGrowlioInsight(goalId),
    queryFn: () => fetchGoalGrowlioInsight(goalId),
    retry: false,
    staleTime: STALE_TIME.MEDIUM,
  });
  if (isError || !data) return null;
  const { performance, feasibility } = data;
  const actualReturn = performance.xirr_pct ?? performance.annual_return_pct;
  if (!feasibility && actualReturn === null) return null;

  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">투자 수익을 반영하면? (growlio)</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-400">이 목표에 필요한 연 수익률</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-50">
            {feasibility?.required_return_pct != null ? formatPercent(feasibility.required_return_pct, 1) : "–"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-400">우리 실제 투자 수익률</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-50">
            {actualReturn !== null ? formatPercent(actualReturn, 1) : "–"}
          </dd>
        </div>
      </dl>
      {feasibility?.note && <p className="text-xs text-gray-500 dark:text-gray-400">{feasibility.note}</p>}
      {feasibility && feasibility.deposit_guide.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">수익률별로 목표일까지 매달 필요한 금액</p>
          {feasibility.deposit_guide.map((g) => (
            <div key={g.annual_return_pct} className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-300">연 {g.annual_return_pct}%</span>
              <span className="font-medium text-gray-900 dark:text-gray-50">
                {g.required_monthly_deposit !== null ? formatKrw(Math.round(g.required_monthly_deposit)) : "–"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
