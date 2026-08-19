import Button from "@/components/common/Button";
import { FORM_LABEL, INPUT_SM } from "@/constants/inputStyles";
import { useMonthlyTargetGrid } from "@/hooks/useMonthlyTargetGrid";
import { formatKrw, formatKrwPreview } from "@/utils/format";
import type { GoalMonthlyTargetIn } from "@/types";

interface Props {
  /** "irregular"(기본값)는 월별 금액을 사용자가 직접 채워 합계가 필요금액이 되는 상향식 —
   * 합계 문구와 필요금액을 연결해 보여준다. "goal"은 필요금액·목표일을 먼저 정하면 월별 계획을
   * 균등분배로 자동 산출하는 하향식이라 문구가 다르고 "균등분배로 다시 계산" 버튼이 추가된다. */
  mode?: "irregular" | "goal";
  startMonth: string;
  endMonth: string;
  targets: GoalMonthlyTargetIn[];
  onChange: (targets: GoalMonthlyTargetIn[]) => void;
  /** mode="goal" 전용 — "균등분배로 다시 계산" 버튼을 누르면 이 금액(필요금액 - 현재 저축액)을
   * 남은 달에 고르게 나눠 채운다. */
  distributeAmount?: string;
}

/** 비정기 목표(kind="irregular")·장기 목표(kind="goal") 폼이 함께 쓰는 월별 목표금액 편집기 —
 * 시작월/종료월 사이의 각 달에 대해 금액 입력 행을 보여준다. 기간이 바뀌면 그 기간에 맞춰 행을
 * 재생성하되, 이미 입력해 둔 월의 금액은 그대로 보존한다(FundingSourceChecklist와 같은 목록 UI
 * 톤을 재사용). */
export default function GoalMonthlyTargetEditor({
  mode = "irregular",
  startMonth,
  endMonth,
  targets,
  onChange,
  distributeAmount,
}: Props) {
  const { months, amountByMonth, total, setAmount, handleDistributeEvenly } = useMonthlyTargetGrid(
    startMonth,
    endMonth,
    targets,
    onChange,
  );

  if (months.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">시작월과 종료월을 먼저 정해주세요.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className={FORM_LABEL}>월별 목표금액</label>
        {mode === "goal" && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleDistributeEvenly(distributeAmount ?? "0")}
          >
            균등분배로 다시 계산
          </Button>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
        {months.map((ym) => {
          const amount = amountByMonth.get(ym) ?? "0";
          return (
            <div key={ym} className="flex items-center gap-2 px-3 py-2">
              <span className="text-sm text-gray-900 dark:text-gray-50 w-16 shrink-0">{ym}</span>
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
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        {mode === "irregular"
          ? `월별 목표금액 합계 ${formatKrw(String(total))}가 이 목표의 필요금액이 돼요.`
          : `월별 계획 합계 ${formatKrw(String(total))} — 필요금액과 별개로 페이스 확인용이에요.`}
      </p>
    </div>
  );
}
