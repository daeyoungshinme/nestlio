import SummaryCard from "@/components/common/SummaryCard";
import { formatKrw } from "@/utils/format";
import type { TotalsOut } from "@/types";

export default function SummaryCards({ totals }: { totals: TotalsOut }) {
  const savings = Number(totals.savings);
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
