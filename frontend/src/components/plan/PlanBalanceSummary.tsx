import { formatKrw, formatKrwCompact } from "@/utils/format";
import { amountToneClass } from "@/utils/colors";

interface Props {
  income: number;
  expense: number;
  /** 저축·투자 계획 합계 — 아직 불러오는 중이면 null */
  savingsPlanned: number | null;
  periodLabel: string;
}

/** 계획의 한 줄 요약: 계획 수입 − 계획 지출 = 저축 가능액, 그리고 그중 저축·투자로 계획한 금액.
 * 예전 요약카드 4개(계획 수입/계획 지출/저축 가능액/계획 저축·투자액)를 모바일 한 화면 폭의 카드 하나로 합쳤다 —
 * 부부가 확인할 핵심은 "남는 돈을 다 저축·투자로 배정했는가" 하나라서 그 차이를 바로 문장으로 보여준다. */
export default function PlanBalanceSummary({ income, expense, savingsPlanned, periodLabel }: Props) {
  const available = income - expense;
  const unallocated = savingsPlanned !== null ? available - savingsPlanned : null;

  return (
    <div className="card">
      <p className="text-xs text-gray-500 dark:text-gray-400">{periodLabel} 저축 가능액 (계획 수입 − 계획 지출)</p>
      <p
        className={`mt-1 text-2xl font-bold ${amountToneClass(available < 0 ? "negative" : "default")}`}
      >
        {formatKrw(available)}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        수입 {formatKrwCompact(income)} · 지출 {formatKrwCompact(expense)}
      </p>
      {savingsPlanned !== null && unallocated !== null && (
        <p
          className={`mt-2 text-sm font-medium ${amountToneClass(unallocated < 0 ? "negative" : "positive")}`}
        >
          {/* 보조 숫자는 축약 — 전체 금액 3개가 한 문장에 들어가 360px에서 2~3줄로 감겼다. */}
          저축·투자 계획 {formatKrwCompact(savingsPlanned)}
          {unallocated > 0 && ` · ${formatKrwCompact(unallocated)} 미배정`}
          {unallocated < 0 && ` · ${formatKrwCompact(-unallocated)} 초과`}
        </p>
      )}
    </div>
  );
}
