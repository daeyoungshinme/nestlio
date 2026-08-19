import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import AnnualPlanMonthlyGrid from "@/components/financialPlan/AnnualPlanMonthlyGrid";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { currentYearMonth } from "@/components/common/MonthPicker";
import ProgressBar from "@/components/common/ProgressBar";
import {
  fetchAnnualSavingsGoals,
  fetchSuggestedAnnualSavingsGoal,
  upsertAnnualSavingsGoal,
} from "@/api/annualSavingsGoals";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw, formatKrwPreview, formatPercent, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { planStatusTextClass } from "@/utils/colors";
import { toast } from "@/utils/toast";
import type { AnnualSavingsGoalMonthlyTargetIn } from "@/types";

const currentYear = () => new Date().getFullYear();

/** 부부 공동 연간/월간 저축목표 — growlio "계획" 탭에서 이관된 값. 목표값 입력은 이 앱이 담당하고,
 * 진행률/달성률은 가구 전체 현금흐름 순저축(수입-지출, app/services/annual_savings_goal_service.py
 * ::compute_progress) 기준으로 이 화면에서 직접 계산해 보여준다. growlio는 별도로 자기 자신의
 * 투자계좌 거래내역 기준 달성률을 계산해 자체 화면에 보여준다(app/routers/external.py로 목표값만
 * 읽기전용으로 동기화하며, growlio의 진행률과는 서로 다른 데이터 소스임).
 *
 * GoalsTab 최상단에 붙는 압축된 요약 스트립으로 쓰인다 — 접혔을 때는 "{연도}년
 * 저축 페이스 {진행률}%" 한 줄 + 진행바만 보이고, 연도 이동·목표금액 입력 폼·이번 달 진행률·
 * 다른 연도 목록은 전부 펼쳤을 때만 나타난다(목표 미설정 연도는 기본 펼침). 금액 입력은
 * AnnualPlanItemForm/AnnualPlanMonthlyGrid와 동일한 패턴 — "연간 총액(균등분배용)" 입력 +
 * 12개월 그리드로, 총액을 넣고 균등분배하거나 달마다 직접 입력해 합산할 수 있다. "재무목표
 * 합계로 채우기" 버튼으로 아래 재무목표 목록의 월 저축금액 합계를 연간 총액 입력에 반영할 수
 * 있어, 두 목표 개념을 입력 한 번으로 이어준다(그리드 반영은 "균등분배로 다시 계산" 버튼을
 * 한 번 더 눌러야 한다 — 이미 달마다 손으로 조정해둔 값을 조용히 덮어쓰지 않기 위해서). */
export default function AnnualSavingsGoalCard() {
  const [year, setYear] = useState(currentYear());
  const [annualTotalDraft, setAnnualTotalDraft] = useState<string | null>(null);
  const [monthlyTargetsDraft, setMonthlyTargetsDraft] = useState<AnnualSavingsGoalMonthlyTargetIn[] | null>(null);
  const [editOpenOverride, setEditOpenOverride] = useState<boolean | null>(null);
  const queryClient = useQueryClient();

  const { data: goals } = useQuery({
    queryKey: QUERY_KEYS.annualSavingsGoals,
    queryFn: fetchAnnualSavingsGoals,
  });

  const { data: suggestion } = useQuery({
    queryKey: QUERY_KEYS.annualSavingsGoalSuggestion,
    queryFn: fetchSuggestedAnnualSavingsGoal,
  });

  const changeYear = (nextYear: number) => {
    setYear(nextYear);
    setAnnualTotalDraft(null);
    setMonthlyTargetsDraft(null);
  };

  const goalOfYear = goals?.find((g) => g.year === year) ?? null;
  const hasTarget = goalOfYear !== null && Number(goalOfYear.target_amount_krw) > 0;
  const editOpen = editOpenOverride ?? !hasTarget;
  const annualTotalValue = annualTotalDraft ?? (hasTarget && goalOfYear ? toAmountInputValue(goalOfYear.target_amount_krw) : "");
  const monthlyTargets =
    monthlyTargetsDraft ??
    (goalOfYear?.monthly_targets.map((t) => ({ year_month: t.year_month, target_amount: t.target_amount })) ?? []);

  const saveMutation = useMutation({
    mutationFn: () => upsertAnnualSavingsGoal(year, { monthly_targets: monthlyTargets }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.annualSavingsGoals });
      setAnnualTotalDraft(null);
      setMonthlyTargetsDraft(null);
      setEditOpenOverride(false);
      toast(`${year}년 저축목표를 저장했습니다.`, "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const otherYears = (goals ?? []).filter((g) => g.year !== year).sort((a, b) => b.year - a.year);
  const thisYearMonth = currentYearMonth();
  const currentMonthTarget = goalOfYear?.monthly_targets.find((t) => t.year_month === thisYearMonth)?.target_amount;

  // 가구 전체 연간 저축목표와 아래 개별 재무목표들의 월 저축금액 합계(연 환산)가 서로 다를 수 있어,
  // 입력 화면을 펼치지 않아도 눈치챌 수 있도록 상시 비교 문구를 보여준다(편집 화면의 "재무목표
  // 합계로 채우기" 배너는 값을 우연히 볼 때만 노출돼 정합성 확인용으로는 부족했다).
  const goalBasedAnnualTotal = suggestion ? Number(suggestion.goal_based_annual_target_krw) : 0;
  const goalTotalDiff = hasTarget && goalOfYear ? goalBasedAnnualTotal - Number(goalOfYear.target_amount_krw) : 0;
  const showGoalTotalDiff = hasTarget && suggestion !== undefined && Math.abs(goalTotalDiff) >= 1;

  return (
    <div className="card space-y-2">
      <button
        type="button"
        onClick={() => setEditOpenOverride((o) => !(o ?? !hasTarget))}
        aria-expanded={editOpen}
        className="w-full flex items-center justify-between gap-2 min-h-[36px]"
      >
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">{year}년 저축 페이스</span>
          {hasTarget && goalOfYear && (
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50 shrink-0">
              {formatPercent(Number(goalOfYear.annual_achievement_pct))}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${editOpen ? "rotate-180" : ""}`}
        />
      </button>

      {!editOpen &&
        (hasTarget && goalOfYear ? (
          <>
            <ProgressBar pct={Number(goalOfYear.annual_achievement_pct)} />
            {showGoalTotalDiff && (
              <p className={`text-xs ${planStatusTextClass("warn")}`}>
                재무목표 합계(연 {formatKrw(String(goalBasedAnnualTotal))})와 {formatKrw(String(Math.abs(goalTotalDiff)))}{" "}
                {goalTotalDiff > 0 ? "부족" : "초과"}해요.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            아직 {year}년 저축목표를 정하지 않았어요. 펼쳐서 금액을 정해보세요.
          </p>
        ))}

      {editOpen && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">연도 선택</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => changeYear(year - 1)}>
                이전 해
              </Button>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 min-w-14 text-center">
                {year}년
              </span>
              <Button size="sm" variant="secondary" onClick={() => changeYear(year + 1)}>
                다음 해
              </Button>
            </div>
          </div>

          {hasTarget && goalOfYear ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">연간 진행률</span>
                <span className="font-semibold text-gray-900 dark:text-gray-50">
                  {formatPercent(Number(goalOfYear.annual_achievement_pct))}
                </span>
              </div>
              <ProgressBar pct={Number(goalOfYear.annual_achievement_pct)} />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {formatKrw(goalOfYear.net_savings_ytd)} / {formatKrw(goalOfYear.target_amount_krw)}
              </p>
              {showGoalTotalDiff && (
                <p className={`text-xs ${planStatusTextClass("warn")}`}>
                  재무목표 합계(연 {formatKrw(String(goalBasedAnnualTotal))})와{" "}
                  {formatKrw(String(Math.abs(goalTotalDiff)))} {goalTotalDiff > 0 ? "부족" : "초과"}해요.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              아직 {year}년 저축목표를 정하지 않았어요. 아래에서 금액을 정해보세요.
            </p>
          )}

          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              부부가 함께 정한 연도별 순저축 목표예요. growlio가 이 값을 읽기전용으로 참고해 투자계좌
              입금 실적 기준 달성률도 함께 보여줘요.
            </p>
            <FormInput
              label="연간 총액 (균등분배용)"
              type="number"
              inputMode="decimal"
              value={annualTotalValue}
              onChange={(e) => setAnnualTotalDraft(e.target.value)}
              className="w-full"
              hint="아래 '균등분배로 다시 계산' 버튼을 누르면 이 금액을 12개월에 고르게 나눠 채워요."
              preview={Number(annualTotalValue) > 0 ? formatKrwPreview(Number(annualTotalValue)) : undefined}
            />
            {suggestion && Number(suggestion.goal_based_annual_target_krw) > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                <span>
                  아래 재무목표들의 월 저축금액 합계: 월 {formatKrw(suggestion.goal_based_monthly_target_krw)} ·
                  연 환산 {formatKrw(suggestion.goal_based_annual_target_krw)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setAnnualTotalDraft(toAmountInputValue(suggestion.goal_based_annual_target_krw))}
                >
                  재무목표 합계로 채우기
                </Button>
              </div>
            )}
            {suggestion && Number(suggestion.suggested_monthly_target_krw) > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                <span>
                  최근 3개월 평균 가구 저축액: 월 {formatKrw(suggestion.suggested_monthly_target_krw)} · 연 환산{" "}
                  {formatKrw(suggestion.suggested_annual_target_krw)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setAnnualTotalDraft(toAmountInputValue(suggestion.suggested_annual_target_krw))}
                >
                  채우기
                </Button>
              </div>
            )}
            <AnnualPlanMonthlyGrid
              startMonth={`${year}-01`}
              endMonth={`${year}-12`}
              targets={monthlyTargets}
              onChange={setMonthlyTargetsDraft}
              distributeAmount={annualTotalValue}
            />
            <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              저장
            </Button>

            {goalOfYear?.monthly_achievement_pct !== null && goalOfYear !== null && hasTarget && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">이번 달 진행률</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-50">
                    {formatPercent(Number(goalOfYear.monthly_achievement_pct))}
                  </span>
                </div>
                <ProgressBar pct={Number(goalOfYear.monthly_achievement_pct)} barClassName="bg-blue-500" />
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {formatKrw(goalOfYear.current_month_savings)} / {formatKrw(currentMonthTarget ?? "0")}
                </p>
              </div>
            )}
            {otherYears.length > 0 && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1">
                {otherYears.map((g) => (
                  <button
                    key={g.year}
                    type="button"
                    onClick={() => changeYear(g.year)}
                    className="w-full flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    <span>{g.year}년</span>
                    <span>{formatKrw(g.target_amount_krw)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
