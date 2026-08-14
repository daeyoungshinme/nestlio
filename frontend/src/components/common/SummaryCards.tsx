import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import SummaryCard from "@/components/common/SummaryCard";
import { formatKrw, formatKrwCompact } from "@/utils/format";
import type { TotalsOut } from "@/types";

interface Props {
  totals: TotalsOut;
  /** When true, shows only 수입/지출/저축 by default and hides 고정/변동/비정기 behind a toggle. */
  collapsible?: boolean;
}

/** 좁은 grid 폭에서 큰 금액이 잘리지 않도록 축약 표기(큰 글씨) + 전체 자릿수(작은 글씨)를 함께
 * 보여준다 — 대시보드 순자산 카드가 쓰는 것과 동일한 패턴. 1만원 미만은 축약해도 원본과 같으므로
 * sub를 생략해 카드가 불필요하게 길어지지 않게 한다. */
function amountProps(value: string | number) {
  const n = Number(value);
  const full = formatKrw(value);
  return {
    value: formatKrwCompact(n),
    sub: Math.abs(n) >= 1e4 ? full : undefined,
    title: full,
  };
}

export default function SummaryCards({ totals, collapsible = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const savings = Number(totals.savings);

  if (!collapsible) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="수입" {...amountProps(totals.income)} tone="positive" />
        <SummaryCard label="지출" {...amountProps(totals.expense)} tone="negative" />
        <SummaryCard label="고정지출" {...amountProps(totals.fixed)} />
        <SummaryCard label="변동지출" {...amountProps(totals.variable)} />
        <SummaryCard label="비정기지출" {...amountProps(totals.irregular)} />
        <SummaryCard
          label="저축(수입-지출)"
          {...amountProps(totals.savings)}
          tone={savings >= 0 ? "positive" : "negative"}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard label="수입" {...amountProps(totals.income)} tone="positive" />
        <SummaryCard label="지출" {...amountProps(totals.expense)} tone="negative" />
        <SummaryCard
          label="저축(수입-지출)"
          {...amountProps(totals.savings)}
          tone={savings >= 0 ? "positive" : "negative"}
          className="col-span-2 sm:col-span-1"
        />
      </div>
      {expanded && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label="고정지출" {...amountProps(totals.fixed)} />
            <SummaryCard label="변동지출" {...amountProps(totals.variable)} />
            <SummaryCard label="비정기지출" {...amountProps(totals.irregular)} className="col-span-2 sm:col-span-1" />
          </div>
          <Link
            to="/financial-plan?tab=현금흐름 계획"
            className="block text-center text-xs font-semibold text-gray-500 dark:text-gray-400 underline hover:no-underline"
          >
            계획 대비 보기
          </Link>
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
      >
        {expanded ? "접기" : "고정·변동·비정기 지출 더보기"}
        <ChevronDown size={14} className={expanded ? "rotate-180" : ""} />
      </button>
    </div>
  );
}
