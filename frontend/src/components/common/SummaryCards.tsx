import { useState } from "react";
import { ChevronDown } from "lucide-react";
import SummaryCard from "@/components/common/SummaryCard";
import { formatKrw } from "@/utils/format";
import type { TotalsOut } from "@/types";

interface Props {
  totals: TotalsOut;
  /** When true, shows only 수입/지출/저축 by default and hides 고정/변동/비정기 behind a toggle. */
  collapsible?: boolean;
}

export default function SummaryCards({ totals, collapsible = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const savings = Number(totals.savings);

  if (!collapsible) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="수입" value={formatKrw(totals.income)} tone="positive" />
        <SummaryCard label="지출" value={formatKrw(totals.expense)} tone="negative" />
        <SummaryCard label="고정지출" value={formatKrw(totals.fixed)} />
        <SummaryCard label="변동지출" value={formatKrw(totals.variable)} />
        <SummaryCard label="비정기지출" value={formatKrw(totals.irregular)} />
        <SummaryCard
          label="저축(수입-지출)"
          value={formatKrw(totals.savings)}
          tone={savings >= 0 ? "positive" : "negative"}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="수입" value={formatKrw(totals.income)} tone="positive" />
        <SummaryCard label="지출" value={formatKrw(totals.expense)} tone="negative" />
        <SummaryCard
          label="저축(수입-지출)"
          value={formatKrw(totals.savings)}
          tone={savings >= 0 ? "positive" : "negative"}
        />
      </div>
      {expanded && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="고정지출" value={formatKrw(totals.fixed)} />
          <SummaryCard label="변동지출" value={formatKrw(totals.variable)} />
          <SummaryCard label="비정기지출" value={formatKrw(totals.irregular)} />
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
