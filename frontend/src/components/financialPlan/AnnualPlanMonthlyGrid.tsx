import { useId, useState } from "react";
import { Copy } from "lucide-react";
import Button from "@/components/common/Button";
import { FORM_LABEL, INPUT_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_COMPACT_MOBILE_ONLY } from "@/constants/uiSizes";
import { useMonthlyTargetGrid } from "@/hooks/useMonthlyTargetGrid";
import { amountInputPreview, formatKrw, formatKrwCompact, formatMonthOnly } from "@/utils/format";
import type { AnnualPlanItemMonthlyTargetIn } from "@/types";

interface Props {
  startMonth: string;
  endMonth: string;
  targets: AnnualPlanItemMonthlyTargetIn[];
  onChange: (targets: AnnualPlanItemMonthlyTargetIn[]) => void;
  /** "균등분배" 버튼을 누르면 이 금액을 적용 기간의 달에 고르게 나눠 채운다. */
  distributeAmount: string;
}

/** 연간계획 항목(AnnualPlanItem)·저축상품 연간계획의 적용 기간(시작월~종료월) 목표금액 편집 그리드.
 * 모바일에서 12칸을 세로로 쌓으면 모달 안에서 한참 스크롤해야 해서 2열(넓은 화면 3열) 격자로 두고, 가장 흔한 입력
 * 두 가지를 위쪽 프리셋으로 뺐다: "매달 같은 금액"(월급·월세처럼 고정), "균등분배"(총액을 나눔). 칸마다의 복사 버튼은
 * 그 달부터 끝까지 같은 금액으로 채운다(중간에 금액이 바뀌는 경우). 항목 단위 실적 비교는 하지 않는다 — 섹션 전체
 * 달성률은 계획 화면의 섹션 아코디언(PlanSectionAccordion) 헤더가 보여준다. */
export default function AnnualPlanMonthlyGrid({ startMonth, endMonth, targets, onChange, distributeAmount }: Props) {
  const fieldId = useId();
  const [sameAmount, setSameAmount] = useState("");
  const { months, amountByMonth, total, setAmount, handleDistributeEvenly } = useMonthlyTargetGrid(
    startMonth,
    endMonth,
    targets,
    onChange,
  );

  /** 이 금액을 sourceYearMonth부터 적용 기간의 끝까지 채운다(기존 값 덮어씀). 이전 달은 건드리지 않는다 —
   * 중간 달에서 눌러도 이미 입력해둔 이전 달 값이 실수로 덮어써지지 않도록. */
  const applyFrom = (sourceYearMonth: string, sourceAmount: string) => {
    onChange(
      months.map((ym) => ({
        year_month: ym,
        target_amount: ym >= sourceYearMonth ? sourceAmount : (amountByMonth.get(ym) ?? "0"),
      })),
    );
  };

  return (
    <div className="space-y-2">
      <p className={FORM_LABEL}>월별 목표금액</p>
      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label htmlFor={`${fieldId}-same`} className="text-xs text-gray-500 dark:text-gray-400">
            매달 같은 금액
          </label>
          <input
            id={`${fieldId}-same`}
            type="number"
            inputMode="decimal"
            value={sameAmount}
            onChange={(e) => setSameAmount(e.target.value)}
            placeholder="예: 300000"
            className={`w-full ${INPUT_SM}`}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!(Number(sameAmount) > 0) || months.length === 0}
          onClick={() => months.length > 0 && applyFrom(months[0], sameAmount)}
        >
          모든 달에 적용
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">{amountInputPreview(sameAmount) ?? ""}</span>
        <Button type="button" variant="secondary" size="sm" onClick={() => handleDistributeEvenly(distributeAmount)}>
          총액 균등분배
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {months.map((ym) => {
          const amount = amountByMonth.get(ym) ?? "0";
          const inputId = `${fieldId}-${ym}`;
          return (
            <div key={ym} className="rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1.5">
              <div className="flex items-center justify-between gap-1">
                <label htmlFor={inputId} className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {formatMonthOnly(ym)}
                </label>
                <button
                  type="button"
                  onClick={() => applyFrom(ym, amount)}
                  disabled={Number(amount) <= 0}
                  aria-label={`${formatMonthOnly(ym)} 금액을 이후 달에 적용`}
                  title="이 금액을 이후 달에 적용"
                  className={`${TOUCH_TARGET_COMPACT_MOBILE_ONLY} shrink-0 -mr-1 text-gray-400 hover:text-primary-600 rounded-lg transition-colors disabled:opacity-30 disabled:hover:text-gray-400`}
                >
                  <Copy size={13} aria-hidden="true" />
                </button>
              </div>
              <input
                id={inputId}
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(ym, e.target.value)}
                className={`w-full ${INPUT_SM}`}
              />
              <p className="mt-0.5 min-h-[16px] text-[11px] text-gray-400 dark:text-gray-500 text-right">
                {Number(amount) > 0 ? formatKrwCompact(Number(amount)) : ""}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">월별 목표금액 합계 {formatKrw(String(total))}</p>
    </div>
  );
}
