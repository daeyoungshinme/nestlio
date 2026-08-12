import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import ProgressBar from "@/components/common/ProgressBar";
import {
  fetchAnnualSavingsGoals,
  fetchSuggestedAnnualSavingsGoal,
  upsertAnnualSavingsGoal,
} from "@/api/annualSavingsGoals";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw, formatKrwPreview, formatPercent, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";

const currentYear = () => new Date().getFullYear();

/** 부부 공동 연간/월간 저축목표 — growlio "계획" 탭에서 이관된 값. 목표값 입력은 이 앱이 담당하고,
 * 진행률/달성률은 가구 전체 현금흐름 순저축(수입-지출, app/services/annual_savings_goal_service.py
 * ::compute_progress) 기준으로 이 화면에서 직접 계산해 보여준다. growlio는 별도로 자기 자신의
 * 투자계좌 거래내역 기준 달성률을 계산해 자체 화면에 보여준다(app/routers/external.py로 목표값만
 * 읽기전용으로 동기화하며, growlio의 진행률과는 서로 다른 데이터 소스임).
 *
 * FinancialGoalsSection 최상단에 붙는 압축된 요약 스트립으로 쓰인다 — 접혔을 때는 "{연도}년
 * 저축 페이스 {진행률}%" 한 줄 + 진행바만 보이고, 연도 이동·목표금액 입력 폼·이번 달 진행률·
 * 다른 연도 목록은 전부 펼쳤을 때만 나타난다(목표 미설정 연도는 기본 펼침). "재무목표 합계로
 * 채우기" 버튼으로 아래 재무목표 목록의 월 저축금액 합계를 그대로 연간목표에 반영할 수 있어,
 * 두 목표 개념을 입력 한 번으로 이어준다. */
export default function AnnualSavingsGoalCard() {
  const [year, setYear] = useState(currentYear());
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [monthlyDraft, setMonthlyDraft] = useState<string | null>(null);
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

  const goalOfYear = goals?.find((g) => g.year === year) ?? null;
  const hasTarget = goalOfYear !== null && Number(goalOfYear.target_amount_krw) > 0;
  const editOpen = editOpenOverride ?? !hasTarget;
  const targetValue = targetDraft ?? (goalOfYear ? toAmountInputValue(goalOfYear.target_amount_krw) : "");
  const monthlyValue =
    monthlyDraft ?? (goalOfYear?.monthly_target_krw ? toAmountInputValue(goalOfYear.monthly_target_krw) : "");

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertAnnualSavingsGoal(year, {
        target_amount_krw: targetValue || "0",
        monthly_target_krw: monthlyValue || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.annualSavingsGoals });
      setTargetDraft(null);
      setMonthlyDraft(null);
      setEditOpenOverride(false);
      toast(`${year}년 저축목표를 저장했습니다.`, "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const otherYears = (goals ?? []).filter((g) => g.year !== year).sort((a, b) => b.year - a.year);

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
          <ProgressBar pct={Number(goalOfYear.annual_achievement_pct)} />
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
              <Button size="sm" variant="secondary" onClick={() => setYear((y) => y - 1)}>
                이전 해
              </Button>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 min-w-14 text-center">
                {year}년
              </span>
              <Button size="sm" variant="secondary" onClick={() => setYear((y) => y + 1)}>
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
            <div className="grid grid-cols-2 gap-3">
              <FormInput
                label="연간 목표금액"
                type="number"
                inputMode="decimal"
                value={targetValue}
                onChange={(e) => setTargetDraft(e.target.value)}
                className="w-full"
                preview={Number(targetValue) > 0 ? formatKrwPreview(Number(targetValue)) : undefined}
              />
              <FormInput
                label="월간 목표금액 (선택)"
                type="number"
                inputMode="decimal"
                value={monthlyValue}
                onChange={(e) => setMonthlyDraft(e.target.value)}
                className="w-full"
                preview={Number(monthlyValue) > 0 ? formatKrwPreview(Number(monthlyValue)) : undefined}
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              월간 목표금액을 비워두면 연간 목표금액을 12개월로 균등 배분해요.
            </p>
            {suggestion && Number(suggestion.goal_based_annual_target_krw) > 0 && (
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                <span>
                  아래 재무목표들의 월 저축금액 합계: 월 {formatKrw(suggestion.goal_based_monthly_target_krw)} ·
                  연 환산 {formatKrw(suggestion.goal_based_annual_target_krw)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setTargetDraft(toAmountInputValue(suggestion.goal_based_annual_target_krw));
                    setMonthlyDraft(toAmountInputValue(suggestion.goal_based_monthly_target_krw));
                  }}
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
                  onClick={() => {
                    setTargetDraft(toAmountInputValue(suggestion.suggested_annual_target_krw));
                    setMonthlyDraft(toAmountInputValue(suggestion.suggested_monthly_target_krw));
                  }}
                >
                  채우기
                </Button>
              </div>
            )}
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
                  {formatKrw(goalOfYear.current_month_savings)} /{" "}
                  {formatKrw(goalOfYear.monthly_target_krw ?? String(Number(goalOfYear.target_amount_krw) / 12))}
                </p>
              </div>
            )}
            {otherYears.length > 0 && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1">
                {otherYears.map((g) => (
                  <button
                    key={g.year}
                    type="button"
                    onClick={() => setYear(g.year)}
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
