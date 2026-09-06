import { Search, X } from "lucide-react";
import TransactionFilterBar, {
  type ExpenseTypeFilter,
  type TopFilter,
  type UserFilter,
} from "@/components/transactions/TransactionFilterBar";
import { INPUT_SM } from "@/constants/inputStyles";
import type { CategoryOut } from "@/types";

interface Props {
  searchInput: string;
  onSearchChange: (value: string) => void;
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

/** 가계부 목록 위에 붙는 sticky 컨트롤 바 — 검색 입력 + 4축 필터 pill. */
export default function LedgerListControls({
  searchInput,
  onSearchChange,
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
  return (
    <div className="sticky top-0 z-10 -mx-3 px-3 py-2 space-y-2 bg-gray-50 dark:bg-gray-950">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="메모나 카테고리로 검색"
          aria-label="거래 내역 검색"
          className={`${INPUT_SM} w-full pl-9 ${searchInput ? "pr-9" : ""}`}
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="검색어 지우기"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      <TransactionFilterBar
        topFilter={topFilter}
        expenseTypeFilter={expenseTypeFilter}
        categoryFilter={categoryFilter}
        categoryOptions={categoryOptions}
        userFilter={userFilter}
        userOptions={userOptions}
        onChangeTopFilter={onChangeTopFilter}
        onChangeExpenseTypeFilter={onChangeExpenseTypeFilter}
        onChangeCategoryFilter={onChangeCategoryFilter}
        onChangeUserFilter={onChangeUserFilter}
      />
    </div>
  );
}
