import StatusBadge from "@/components/common/StatusBadge";
import { linkedGoalBadgeStyle, returnRateTextColor, savingsProductTypeBadgeStyle, savingsProductTypeLabel } from "@/utils/colors";
import { formatKrw, formatReturnPct } from "@/utils/format";
import type { FinancialGoalOut, SavingsProductOut } from "@/types";

/** 저축·투자/부동산 행이 함께 쓰는 조각 — 두 섹션이 같은 마크업을 복붙하던 것을 모았다. */

/** 이 상품을 자금원으로 연동한 목표들. */
export function goalsLinkedToProduct(goals: FinancialGoalOut[] | undefined, productId: number): FinancialGoalOut[] {
  return goals?.filter((g) => g.funding_sources.some((fs) => fs.type === "savings_product" && fs.id === productId)) ?? [];
}

/** growlio 가져오기 모달이 "이미 가져온 계좌"를 거르는 id 집합. */
export function growlioIdSet(ids: (string | null)[]): Set<string> {
  return new Set(ids.filter((id): id is string => !!id));
}

/** 유형 칩 · 연동 목표 배지 · 수익률 — 행 이름 아래 첫 줄. */
export function ProductBadges({ product, linkedGoals }: { product: SavingsProductOut; linkedGoals: FinancialGoalOut[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-1">
      <StatusBadge
        size="chip"
        label={savingsProductTypeLabel(product.product_type)}
        toneClassName={savingsProductTypeBadgeStyle(product.product_type)}
        className="shrink-0"
      />
      {linkedGoals.length > 0 && (
        <StatusBadge
          size="chip"
          label={`목표: ${linkedGoals[0].name}${linkedGoals.length > 1 ? ` 외 ${linkedGoals.length - 1}건` : ""}`}
          toneClassName={linkedGoalBadgeStyle()}
          className="shrink-0 max-w-[140px] sm:max-w-[220px] truncate"
          title={`목표: ${linkedGoals.map((g) => g.name).join(", ")}`}
        />
      )}
      {product.return_rate_pct !== null && (
        <span className={`shrink-0 text-[11px] font-semibold ${returnRateTextColor(Number(product.return_rate_pct))}`}>
          {formatReturnPct(product.return_rate_pct, true)}
        </span>
      )}
    </div>
  );
}

/** " · 원금 X (+Y)" — 평가손익이 있을 때만. 부동산은 label="매입가". */
export function ReturnAmountText({ product, label }: { product: SavingsProductOut; label: string }) {
  if (product.return_amount === null) return null;
  return (
    <span className={returnRateTextColor(Number(product.return_rate_pct))}>
      {" "}
      · {label} {formatKrw(product.principal_amount)} ({Number(product.return_amount) > 0 ? "+" : ""}
      {formatKrw(product.return_amount)})
    </span>
  );
}
