import SavingsPlanProductRow from "@/components/financialPlan/SavingsPlanProductRow";
import SectionAchievementBar from "@/components/financialPlan/SectionAchievementBar";
import type { NormalizedItem } from "@/components/financialPlan/savingsPlanItems";
import type {
  SavingsProductAnnualPlanGroupOut,
  SavingsProductOut,
  SavingsProductPlanGroupOut,
  UserOut,
} from "@/types";

/** 저축 또는 투자 묶음 카드 — 묶음 달성 막대와 상품 행들. 상품이 없으면 그리지 않는다. */
export default function SavingsPlanTypeGroup({
  label,
  summary,
  headerValueText,
  items,
  productById,
  users,
  yearMonth,
  year,
}: {
  label: string;
  summary: SavingsProductPlanGroupOut | SavingsProductAnnualPlanGroupOut;
  headerValueText: string;
  items: NormalizedItem[];
  productById: Map<number, SavingsProductOut>;
  users: UserOut[] | undefined;
  yearMonth: string;
  year: number;
}) {
  if (items.length === 0) return null;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h3>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">{headerValueText}</span>
      </div>
      <SectionAchievementBar label={label} summary={summary} />
      <div>
        {items.map((item) => (
          <SavingsPlanProductRow
            key={item.id}
            item={item}
            product={productById.get(item.id)}
            users={users}
            yearMonth={yearMonth}
            year={year}
          />
        ))}
      </div>
    </div>
  );
}
