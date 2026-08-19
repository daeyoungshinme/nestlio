import { Copy } from "lucide-react";
import Button from "@/components/common/Button";
import { FORM_LABEL, INPUT_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { buildYearMonthRange, distributeAmountEvenly } from "@/utils/monthRange";
import { formatKrw, formatKrwPreview, toAmountInputValue } from "@/utils/format";
import type { AnnualPlanItemMonthlyTargetIn } from "@/types";

interface Props {
  startMonth: string;
  endMonth: string;
  targets: AnnualPlanItemMonthlyTargetIn[];
  onChange: (targets: AnnualPlanItemMonthlyTargetIn[]) => void;
  /** "균등분배로 다시 계산" 버튼을 누르면 이 금액을 적용 기간의 달에 고르게 나눠 채운다. */
  distributeAmount: string;
}

/** 연간계획 항목(AnnualPlanItem)의 적용 기간(시작월~종료월) 목표금액 편집 그리드 —
 * GoalMonthlyTargetEditor의 mode="goal"(총액 입력 → 균등분배)과 같은 상호작용이지만, 개별 목표
 * (FinancialGoal)와는 무관한 별도 컴포넌트다. 항목 단위 실적 비교는 하지 않으므로(월간
 * CashflowPlanItemRow도 항목별 실적을 보여주지 않는 것과 동일) 실적/달성률 컬럼은 없다 — 섹션
 * 전체 달성률은 AnnualPlanPanel의 SectionAchievementBar가 별도로 보여준다. */
export default function AnnualPlanMonthlyGrid({ startMonth, endMonth, targets, onChange, distributeAmount }: Props) {
  const months = buildYearMonthRange(startMonth, endMonth);
  const amountByMonth = new Map(targets.map((t) => [t.year_month, toAmountInputValue(t.target_amount)]));
  const total = targets.reduce((sum, t) => sum + (Number(t.target_amount) || 0), 0);

  const setAmount = (yearMonth: string, amount: string) => {
    const next = months.map((ym) => ({
      year_month: ym,
      target_amount: ym === yearMonth ? amount : (amountByMonth.get(ym) ?? "0"),
    }));
    onChange(next);
  };

  const handleDistributeEvenly = () => {
    const distributed = distributeAmountEvenly(distributeAmount || "0", months);
    onChange(months.map((ym) => ({ year_month: ym, target_amount: distributed[ym] ?? "0" })));
  };

  /** 이 달에 입력된 금액을 이 달부터 적용 기간의 끝까지("나머지" 달)에 그대로 복사한다(기존 값
   * 덮어씀) — 월급처럼 매달 같은 금액을 반복 입력하지 않아도 되도록 하는 단축 버튼.
   * distributeAmountEvenly(총액을 나눠 채움)와 달리 이미 입력한 값을 복사만 한다. 소스 월보다
   * 이전 달은 라벨("나머지 달에 적용")대로 건드리지 않는다 — 중간 달에서 눌러도 이미 입력해둔
   * 이전 달 값이 실수로 덮어써지지 않도록 한다. */
  const applyToRemaining = (sourceYearMonth: string) => {
    const sourceAmount = amountByMonth.get(sourceYearMonth) ?? "0";
    onChange(
      months.map((ym) => ({
        year_month: ym,
        target_amount: ym >= sourceYearMonth ? sourceAmount : (amountByMonth.get(ym) ?? "0"),
      })),
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className={FORM_LABEL}>월별 목표금액</label>
        <Button type="button" variant="secondary" size="sm" onClick={handleDistributeEvenly}>
          균등분배로 다시 계산
        </Button>
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        {months.map((ym) => {
          const amount = amountByMonth.get(ym) ?? "0";
          return (
            <div key={ym} className="flex items-center gap-2 px-3 py-2">
              <span className="text-sm text-gray-900 dark:text-gray-50 w-12 shrink-0">{Number(ym.slice(5))}월</span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(ym, e.target.value)}
                className={`flex-1 min-w-0 ${INPUT_SM}`}
              />
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 w-24 text-right">
                {Number(amount) > 0 ? formatKrwPreview(Number(amount)) : ""}
              </span>
              <button
                type="button"
                onClick={() => applyToRemaining(ym)}
                disabled={Number(amount) <= 0}
                aria-label="이 금액을 나머지 달에 적용"
                title="이 금액을 나머지 달에 적용"
                className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} shrink-0 p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400`}
              >
                <Copy size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">월별 목표금액 합계 {formatKrw(String(total))}</p>
    </div>
  );
}
