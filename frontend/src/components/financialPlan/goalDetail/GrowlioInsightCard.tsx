import { useQuery } from "@tanstack/react-query";
import { fetchGoalGrowlioInsight } from "@/api/goals";
import { STALE_TIME } from "@/constants/queryConfig";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw, formatReturnPct, formatYearMonth } from "@/utils/format";

/** "투자 수익을 반영하면?" — growlio가 계산한 이 목표의 필요 연수익률과 실제 투자 수익률(XIRR)을 나란히 보여주고,
 * 가정 수익률별로 매달 얼마를 모아야 하는지 안내한다. growlio 미설정·접속 실패·목표일 없음이면 숨긴다. */
export default function GrowlioInsightCard({ goalId }: { goalId: number }) {
  const { data, isError } = useQuery({
    queryKey: QUERY_KEYS.financialGoalGrowlioInsight(goalId),
    queryFn: () => fetchGoalGrowlioInsight(goalId),
    retry: false,
    staleTime: STALE_TIME.MEDIUM,
  });
  if (isError || !data) return null;
  const { performance, feasibility, linked_performance: linked, eta_with_actual_return_year_month: etaActual } = data;
  // 목표에 연동된 계좌의 수익률이 있으면 그것을, 없으면 growlio 전체 계좌 수익률을 "우리 실제 수익률"로 보여준다.
  const linkedReturn = linked?.xirr_pct ?? null;
  const actualReturn = linkedReturn ?? performance.xirr_pct ?? performance.annual_return_pct;
  const directDepositTotal = data.direct_deposits.reduce((sum, d) => sum + Number(d.amount), 0);
  if (!feasibility && actualReturn === null && directDepositTotal === 0) return null;

  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">투자 수익을 반영하면? (growlio)</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-400">이 목표에 필요한 연 수익률</dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-50">
            {feasibility?.required_return_pct != null ? formatReturnPct(feasibility.required_return_pct) : "–"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500 dark:text-gray-400">
            {linkedReturn !== null ? "연동 계좌 실제 수익률" : "우리 실제 투자 수익률"}
          </dt>
          <dd className="font-semibold text-gray-900 dark:text-gray-50">
            {actualReturn !== null ? formatReturnPct(actualReturn) : "–"}
          </dd>
        </div>
      </dl>
      {etaActual && (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          지금 수익률이 이어지면 <span className="font-semibold">{formatYearMonth(etaActual)}</span>에 도달해요
        </p>
      )}
      {directDepositTotal > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          가계부 밖에서 growlio 계좌로 직접 들어온 돈(최근 {data.direct_deposits.length}개월){" "}
          <span className="font-semibold text-gray-700 dark:text-gray-300">{formatKrw(directDepositTotal)}</span>도
          목표에 쌓이고 있어요
        </p>
      )}
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
