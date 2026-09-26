import { useState } from "react";
import { SlidersHorizontal, Search, X } from "lucide-react";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
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

/** 가계부 목록 위에 붙는 sticky 컨트롤 바 — 검색 입력 + "필터" 버튼. 구분/지출유형/카테고리/사람 4축 필터는
 * 예전엔 목록 위에 최대 4줄의 칩으로 펼쳐져 모바일 첫 화면을 밀어냈다. 이제 바텀시트로 접고 버튼에 적용 개수만
 * 보여준다. */
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
  const [showSheet, setShowSheet] = useState(false);
  const activeCount =
    (topFilter !== "all" ? 1 : 0) +
    (expenseTypeFilter !== "all" ? 1 : 0) +
    (categoryFilter !== "all" ? 1 : 0) +
    (userFilter !== "all" ? 1 : 0);
  const resetFilters = () => {
    onChangeTopFilter("all");
    onChangeExpenseTypeFilter("all");
    onChangeCategoryFilter("all");
    onChangeUserFilter("all");
  };

  return (
    <div className="sticky top-0 z-10 -mx-3 px-3 py-2 flex items-center gap-2 bg-gray-50 dark:bg-gray-950">
      <div className="relative flex-1">
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

      <button
        type="button"
        onClick={() => setShowSheet(true)}
        aria-label={activeCount > 0 ? `필터, ${activeCount}개 적용됨` : "필터"}
        className={`relative flex items-center gap-1.5 shrink-0 min-h-[44px] px-3 rounded-lg border text-sm font-medium transition-colors ${
          activeCount > 0
            ? "border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400"
            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        필터{activeCount > 0 && ` ${activeCount}`}
      </button>

      {showSheet && (
        <Modal onClose={() => setShowSheet(false)} title="필터" closeOnBackdrop>
          <div className="p-5 space-y-4 overflow-y-auto">
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
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={resetFilters} disabled={activeCount === 0}>
                초기화
              </Button>
              <Button className="flex-1" onClick={() => setShowSheet(false)}>
                결과 보기
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
