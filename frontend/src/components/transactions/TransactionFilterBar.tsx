import { TOUCH_TARGET_COMPACT_MOBILE_ONLY } from "@/constants/uiSizes";
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

/** "all" | 사용자 id. 옵션 목록(누구를 "나"/표시명으로 부를지)은 호출부가 로그인 사용자 기준으로 만들어 넘긴다. */
export type UserFilter = string;

interface Props {
  topFilter: TopFilter;
  expenseTypeFilter: ExpenseTypeFilter;
  categoryFilter: number | "all";
  categoryOptions: CategoryOut[];
  userFilter: UserFilter;
  userOptions: { value: UserFilter; label: string }[];
  onChangeTopFilter: (value: TopFilter) => void;
  onChangeExpenseTypeFilter: (value: ExpenseTypeFilter) => void;
  onChangeCategoryFilter: (value: number | "all") => void;
  onChangeUserFilter: (value: UserFilter) => void;
}

function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-nowrap gap-1 overflow-x-auto scrollbar-none bg-gray-100 dark:bg-gray-800 rounded-lg p-1"
    >
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${TOUCH_TARGET_COMPACT_MOBILE_ONLY} ${
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

/** 가계부 목록 위에 상시 노출되는 인라인 필터 바(구 `TransactionFilterSheet` 바텀시트를 대체).
 * 1행: 구분(전체/수입/지출/저축) + 필요 시 사용자(나/배우자/공동). 지출을 고르면 2행에 지출 유형,
 * 수입·지출을 고르면 3행에 그 달 실제 사용 카테고리 칩이 추가로 뜬다. */
export default function TransactionFilterBar({
  topFilter,
  expenseTypeFilter,
  categoryFilter,
  categoryOptions,
  userFilter,
  userOptions,
  onChangeTopFilter,
  onChangeExpenseTypeFilter,
  onChangeCategoryFilter,
  onChangeUserFilter,
}: Props) {
  const showCategoryRow =
    (topFilter === "income" || topFilter === "expense") && categoryOptions.length > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <PillGroup ariaLabel="구분" options={TOP_FILTER_OPTIONS} value={topFilter} onChange={onChangeTopFilter} />
        {userOptions.length > 2 && (
          <PillGroup ariaLabel="누가" options={userOptions} value={userFilter} onChange={onChangeUserFilter} />
        )}
      </div>

      {topFilter === "expense" && (
        <PillGroup
          ariaLabel="지출 유형"
          options={EXPENSE_TYPE_FILTER_OPTIONS}
          value={expenseTypeFilter}
          onChange={onChangeExpenseTypeFilter}
        />
      )}

      {showCategoryRow && (
        <PillGroup
          ariaLabel="카테고리"
          options={[
            { value: "all" as number | "all", label: "전체" },
            ...categoryOptions.map((c) => ({ value: c.id as number | "all", label: c.name })),
          ]}
          value={categoryFilter}
          onChange={onChangeCategoryFilter}
        />
      )}
    </div>
  );
}
