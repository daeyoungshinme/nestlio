import Modal from "@/components/common/Modal";
import { SELECT_SM } from "@/constants/inputStyles";
import type { CategoryOut } from "@/types";

export type TopFilter = "all" | "income" | "expense" | "savings";

export const TOP_FILTER_OPTIONS: { value: TopFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "income", label: "수입" },
  { value: "expense", label: "지출" },
  { value: "savings", label: "저축/투자" },
];

export type ExpenseTypeFilter = "all" | "fixed" | "variable" | "irregular";

export const EXPENSE_TYPE_FILTER_OPTIONS: { value: ExpenseTypeFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "fixed", label: "고정지출" },
  { value: "variable", label: "변동지출" },
  { value: "irregular", label: "비정기지출" },
];

/** Human-readable summary of the current filter, shown on the pill when the sheet is closed. */
export function filterSummaryLabel(
  topFilter: TopFilter,
  expenseTypeFilter: ExpenseTypeFilter,
  categoryFilter: number | "all",
  categoryOptions: CategoryOut[],
): string {
  if (topFilter === "all") return "전체";
  const parts = [TOP_FILTER_OPTIONS.find((o) => o.value === topFilter)?.label ?? ""];
  if (topFilter === "expense" && expenseTypeFilter !== "all") {
    parts.push(EXPENSE_TYPE_FILTER_OPTIONS.find((o) => o.value === expenseTypeFilter)?.label ?? "");
  }
  if (categoryFilter !== "all") {
    const category = categoryOptions.find((c) => c.id === categoryFilter);
    if (category) parts.push(category.name);
  }
  return parts.join(" · ");
}

interface Props {
  topFilter: TopFilter;
  expenseTypeFilter: ExpenseTypeFilter;
  categoryFilter: number | "all";
  categoryOptions: CategoryOut[];
  onChangeTopFilter: (value: TopFilter) => void;
  onChangeExpenseTypeFilter: (value: ExpenseTypeFilter) => void;
  onChangeCategoryFilter: (value: number | "all") => void;
  onClose: () => void;
}

function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-nowrap gap-1 overflow-x-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            value === opt.value
              ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-50"
              : "text-gray-500 dark:text-gray-400"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom-sheet collecting the ledger's 3-tier filter (구분 → 지출 유형 → 카테고리) behind a single entry point. */
export default function TransactionFilterSheet({
  topFilter,
  expenseTypeFilter,
  categoryFilter,
  categoryOptions,
  onChangeTopFilter,
  onChangeExpenseTypeFilter,
  onChangeCategoryFilter,
  onClose,
}: Props) {
  return (
    <Modal onClose={onClose} title="필터" size="sm" closeOnBackdrop>
      <div className="p-4 space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">구분</p>
          <PillGroup options={TOP_FILTER_OPTIONS} value={topFilter} onChange={onChangeTopFilter} />
        </div>

        {topFilter === "expense" && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">지출 유형</p>
            <PillGroup
              options={EXPENSE_TYPE_FILTER_OPTIONS}
              value={expenseTypeFilter}
              onChange={onChangeExpenseTypeFilter}
            />
          </div>
        )}

        {(topFilter === "income" || topFilter === "expense") && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">카테고리</p>
            <select
              value={categoryFilter === "all" ? "all" : String(categoryFilter)}
              onChange={(e) => onChangeCategoryFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className={SELECT_SM}
              aria-label="카테고리 필터"
            >
              <option value="all">전체</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 text-sm font-semibold text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-lg transition-colors"
        >
          적용
        </button>
      </div>
    </Modal>
  );
}
